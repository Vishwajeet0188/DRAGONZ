import { and, asc, count, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { env } from '../../config/env.js';
import { notFound } from '../../lib/errors.js';
import { pageMeta, paginate, uniqueSlug, compact } from '../../lib/util.js';
import { audit } from '../../services/audit.js';
import { queueEmail } from '../../services/email/index.js';
import { logger } from '../../lib/logger.js';

const { events, eventReminders, members, users, notifications, notificationPreferences } = schema;
const organizerMini = { id: members.id, slug: members.slug, displayName: members.displayName, avatarUrl: members.avatarUrl, accentColor: members.accentColor };
const publicStatuses = ['SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'];
const REMINDER_LEAD_MS = 60 * 60_000; // remind 1 hour before start

// ── Public ────────────────────────────────────────────────────────────────
export async function listEvents({ when = 'upcoming', page, pageSize }) {
  const pg = paginate({ page, pageSize });
  const now = new Date(Date.now() - 6 * 3600_000); // events stay "upcoming" for 6h after start
  const where = and(isNull(events.deletedAt), inArray(events.status, publicStatuses),
    when === 'past' ? or(lt(events.startsAt, now), eq(events.status, 'COMPLETED')) : and(gte(events.startsAt, now), ne(events.status, 'COMPLETED')));
  const [rows, [{ total }]] = await Promise.all([
    db.select({ event: events, organizer: organizerMini }).from(events).leftJoin(members, eq(members.id, events.organizerMemberId))
      .where(where).orderBy(when === 'past' ? desc(events.startsAt) : asc(events.startsAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(events).where(where),
  ]);
  return { data: rows.map(({ event, organizer }) => ({ ...event, organizer: organizer?.id ? organizer : null })), meta: pageMeta(pg, total) };
}

export async function getEvent(slug, viewerId) {
  const [row] = await db.select({ event: events, organizer: organizerMini }).from(events)
    .leftJoin(members, eq(members.id, events.organizerMemberId))
    .where(and(eq(events.slug, slug), isNull(events.deletedAt), inArray(events.status, publicStatuses))).limit(1);
  if (!row) throw notFound('Event not found');
  const [[{ reminders }], mine] = await Promise.all([
    db.select({ reminders: count() }).from(eventReminders).where(eq(eventReminders.eventId, row.event.id)),
    viewerId ? db.select().from(eventReminders).where(and(eq(eventReminders.eventId, row.event.id), eq(eventReminders.userId, viewerId))).limit(1) : [],
  ]);
  return { ...row.event, organizer: row.organizer?.id ? row.organizer : null, stats: { reminders }, viewer: { reminder: mine.length > 0 } };
}

export async function setReminder(slug, userId, on) {
  const e = await getEvent(slug);
  if (on) await db.insert(eventReminders).values({ userId, eventId: e.id }).onConflictDoNothing();
  else await db.delete(eventReminders).where(and(eq(eventReminders.userId, userId), eq(eventReminders.eventId, e.id)));
  return { reminder: on };
}

// RFC 5545 calendar file. Text is escaped and lines are folded at 75 octets.
const icsEscape = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (line) => {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) { out.push(rest.slice(0, 73)); rest = ' ' + rest.slice(73); }
  out.push(rest);
  return out.join('\r\n');
};
export async function eventIcs(slug) {
  const e = await getEvent(slug);
  const end = e.endsAt ?? new Date(new Date(e.startsAt).getTime() + 2 * 3600_000);
  const url = `${env.APP_URL}/events/${e.slug}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dragonz Central//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${e.id}@dragonz-central`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(e.startsAt)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`, `DESCRIPTION:${icsEscape(`${e.description.slice(0, 900)}\n\n${url}`)}`, `URL:${url}`,
    e.status === 'CANCELLED' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return { filename: `${e.slug}.ics`, body: lines.map(fold).join('\r\n') + '\r\n' };
}

/** Job: remind users ~1h before events they asked to be reminded about. Returns count. */
export async function sendDueEventReminders() {
  const now = new Date();
  const due = await db.select({ reminder: eventReminders, event: events, user: users, prefs: notificationPreferences })
    .from(eventReminders)
    .innerJoin(events, eq(events.id, eventReminders.eventId))
    .innerJoin(users, eq(users.id, eventReminders.userId))
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
    .where(and(
      isNull(eventReminders.sentAt), isNull(events.deletedAt), isNull(users.deletedAt),
      inArray(events.status, ['SCHEDULED', 'LIVE']),
      gte(events.startsAt, new Date(now.getTime() - 15 * 60_000)),
      lt(events.startsAt, new Date(now.getTime() + REMINDER_LEAD_MS)),
    )).limit(500);

  for (const { reminder, event, user, prefs } of due) {
    const url = `${env.APP_URL}/events/${event.slug}`;
    const title = `Starting soon: ${event.title}`;
    if (prefs?.inAppEnabled !== false) {
      await db.insert(notifications).values({ userId: user.id, type: 'EVENT_REMINDER', title, body: event.description.slice(0, 200), url, imageUrl: event.bannerUrl, dedupeKey: `event:${event.id}` }).onConflictDoNothing();
    }
    if (prefs?.emailEventReminders && user.emailVerifiedAt) {
      await queueEmail({ to: user.email, template: 'eventReminder', data: { displayName: user.displayName, title: event.title, startsAt: event.startsAt, url, streamUrl: event.streamUrl }, dedupeKey: `event:${event.id}:${user.id}` });
    }
    await db.update(eventReminders).set({ sentAt: now }).where(and(eq(eventReminders.userId, reminder.userId), eq(eventReminders.eventId, reminder.eventId)));
  }
  if (due.length) logger.info({ count: due.length }, 'event reminders sent');
  return due.length;
}

// ── Admin ─────────────────────────────────────────────────────────────────
export async function adminListEvents({ page, pageSize }) {
  const pg = paginate({ page, pageSize });
  const where = isNull(events.deletedAt);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ event: events, organizer: organizerMini, reminders: sql`(select count(*)::int from event_reminders r where r.event_id = ${events.id})` })
      .from(events).leftJoin(members, eq(members.id, events.organizerMemberId))
      .where(where).orderBy(desc(events.startsAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(events).where(where),
  ]);
  return { data: rows.map(({ event, organizer, reminders }) => ({ ...event, organizer: organizer?.id ? organizer : null, reminders })), meta: pageMeta(pg, total) };
}

export async function adminGetEvent(id) {
  const [row] = await db.select().from(events).where(and(eq(events.id, id), isNull(events.deletedAt))).limit(1);
  if (!row) throw notFound('Event not found');
  return row;
}

export async function createEvent(actor, body) {
  const slug = await uniqueSlug(db, events, body.slug || body.title);
  const [row] = await db.insert(events).values({ ...body, slug, createdById: actor.id }).returning();
  await audit(actor.id, 'event.create', 'event', row.id, { title: row.title });
  return row;
}

export async function updateEvent(actor, id, patch) {
  await adminGetEvent(id);
  const changes = compact(patch);
  if (changes.slug) changes.slug = await uniqueSlug(db, events, changes.slug, id);
  const [row] = await db.update(events).set(changes).where(eq(events.id, id)).returning();
  await audit(actor.id, 'event.update', 'event', id, { fields: Object.keys(changes) });
  return row;
}

export async function deleteEvent(actor, id) {
  await adminGetEvent(id);
  await db.update(events).set({ deletedAt: new Date(), slug: `deleted-${id}` }).where(eq(events.id, id));
  await audit(actor.id, 'event.delete', 'event', id);
}
