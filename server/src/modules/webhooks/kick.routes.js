// Kick webhook receiver (production: Kick calls this when a subscribed channel goes live/offline).
// Security: every request must carry a valid RSA-SHA256 signature from Kick over
// "<message-id>.<timestamp>.<raw body>", be recent, and not be a replay.
import crypto from 'node:crypto';
import { Router } from 'express';
import { logger } from '../../lib/logger.js';
import { getProvider, requestSync } from '../../integrations/index.js';

// Documented Kick public key (https://docs.kick.com/events/webhook-security). Refreshed from the API when possible.
const DOCUMENTED_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

const MAX_AGE_MS = 10 * 60_000;
const seen = new Map(); // message id → time (replay protection)

export function verifyKickSignature({ messageId, timestamp, rawBody, signature }, publicKeyPem) {
  if (!messageId || !timestamp || !signature || !rawBody) return false;
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${messageId}.${timestamp}.${rawBody.toString('utf8')}`);
    return verifier.verify(publicKeyPem, signature, 'base64');
  } catch {
    return false;
  }
}

export function createKickWebhookRouter({ getPublicKey = null, onLiveStatus = () => requestSync('KICK') } = {}) {
  let publicKey = DOCUMENTED_KEY;
  let keyFetchedAt = 0;
  const refreshKey = async () => {
    const fetcher = getPublicKey ?? getProvider('KICK')?.getPublicKey;
    if (!fetcher || Date.now() - keyFetchedAt < 24 * 3600_000) return;
    keyFetchedAt = Date.now();
    try { publicKey = (await fetcher()) || publicKey; } catch { /* keep documented key */ }
  };

  const router = Router();
  router.post('/', async (req, res) => {
    await refreshKey();
    const h = (n) => req.get(n);
    const messageId = h('Kick-Event-Message-Id');
    const timestamp = h('Kick-Event-Message-Timestamp');
    const ok = verifyKickSignature({ messageId, timestamp, rawBody: req.rawBody, signature: h('Kick-Event-Signature') }, publicKey);
    if (!ok) {
      logger.warn({ messageId }, 'rejected Kick webhook: bad signature');
      return res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'Invalid signature' } });
    }
    const sentAt = Date.parse(timestamp);
    if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > MAX_AGE_MS) {
      return res.status(400).json({ error: { code: 'STALE', message: 'Stale event' } });
    }
    if (seen.has(messageId)) return res.status(200).json({ data: { duplicate: true } });
    seen.set(messageId, Date.now());
    if (seen.size > 5000) for (const [k, t] of seen) if (Date.now() - t > MAX_AGE_MS) seen.delete(k);

    const type = h('Kick-Event-Type');
    if (type === 'livestream.status.updated' || type === 'livestream.metadata.updated') {
      logger.info({ type, broadcaster: req.body?.broadcaster?.channel_slug, live: req.body?.is_live }, 'Kick webhook');
      onLiveStatus(req.body);
    }
    // Always 200 quickly; the actual work happens in the (debounced) sync.
    res.status(200).json({ data: { ok: true } });
  });
  return router;
}
