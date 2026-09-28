// Email service: provider abstraction + transactional outbox.
//  - Every email is written to email_outbox with a dedupeKey (unique) → duplicates are impossible.
//  - Sending is attempted immediately; failures are retried by the worker with exponential backoff.
import { and, eq, lte, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { templates } from './templates.js';

const MAX_ATTEMPTS = 5;

// ── Providers ────────────────────────────────────────────────────────────
const providers = {
  // Development only (blocked in production by config/env.js). Logs the text body so links can be clicked locally.
  console: {
    async send({ to, subject, text }) {
      logger.info({ to, subject }, `📧 [console email]\n${text}`);
    },
  },
  resend: {
    async send({ to, subject, html, text }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    },
  },
  // Brevo transactional API over HTTPS — works on hosts that block SMTP ports (e.g. Render's free plan).
  brevo: {
    async send({ to, subject, html, text }) {
      const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(env.EMAIL_FROM);
      const sender = m ? { name: m[1].trim() || 'Dragonz Central', email: m[2].trim() } : { name: 'Dragonz Central', email: env.EMAIL_FROM.trim() };
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.EMAIL_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(`Brevo responded ${res.status}${detail.message ? `: ${String(detail.message).slice(0, 200)}` : ''}`);
      }
    },
  },
};

// SMTP works with Brevo, Gmail (app password), Zoho, Mailgun… — whatever you have for free.
let smtpTransport;
providers.smtp = {
  async send({ to, subject, html, text }) {
    if (!smtpTransport) {
      const { default: nodemailer } = await import('nodemailer');
      smtpTransport = nodemailer.createTransport({
        host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      });
    }
    await smtpTransport.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
  },
};

const provider = () => providers[env.EMAIL_PROVIDER];

// ── Outbox ───────────────────────────────────────────────────────────────
/**
 * Queue an email. Returns false if an email with the same dedupeKey already exists.
 * @param {{to:string, template:keyof templates, data:object, dedupeKey:string}} opts
 */
export async function queueEmail({ to, template, data, dedupeKey }) {
  if (!templates[template]) throw new Error(`Unknown email template ${template}`);
  const { subject } = templates[template](data);
  const [row] = await db.insert(schema.emailOutbox)
    .values({ toAddress: to, template, subject, payload: data, dedupeKey })
    .onConflictDoNothing({ target: schema.emailOutbox.dedupeKey })
    .returning();
  if (!row) return false;
  // Fire-and-forget immediate attempt; the worker handles retries.
  deliver(row).catch(() => {});
  return true;
}

async function deliver(row) {
  const rendered = templates[row.template](row.payload);
  try {
    await provider().send({ to: row.toAddress, ...rendered });
    await db.update(schema.emailOutbox)
      .set({ status: 'SENT', sentAt: new Date(), attempts: row.attempts + 1, lastError: null, payload: {} }) // drop payload (may hold tokens) once sent
      .where(eq(schema.emailOutbox.id, row.id));
  } catch (err) {
    const attempts = row.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    logger.warn({ template: row.template, attempts, err: err.message }, 'email delivery failed');
    await db.update(schema.emailOutbox)
      .set({
        attempts,
        status: failed ? 'FAILED' : 'QUEUED',
        lastError: String(err.message).slice(0, 500),
        nextAttemptAt: new Date(Date.now() + 2 ** attempts * 30_000),
        ...(failed && { payload: {} }),
      })
      .where(eq(schema.emailOutbox.id, row.id));
  }
}

/** Process due retries. Uses SKIP LOCKED so multiple instances never double-send. */
export async function processOutbox(batch = 20) {
  const rows = await db.transaction(async (tx) => {
    const due = await tx.select().from(schema.emailOutbox)
      .where(and(eq(schema.emailOutbox.status, 'QUEUED'), lte(schema.emailOutbox.nextAttemptAt, new Date())))
      .limit(batch)
      .for('update', { skipLocked: true });
    if (due.length) {
      // Push nextAttempt forward so other workers skip these while we send.
      await tx.update(schema.emailOutbox)
        .set({ nextAttemptAt: sql`now() + interval '5 minutes'` })
        .where(sql`${schema.emailOutbox.id} in ${due.map((r) => r.id)}`);
    }
    return due;
  });
  for (const row of rows) await deliver(row);
  return rows.length;
}

export function startEmailWorker(intervalMs = 30_000) {
  const timer = setInterval(() => processOutbox().catch((err) => logger.error({ err }, 'outbox worker error')), intervalMs);
  timer.unref();
  return timer;
}
