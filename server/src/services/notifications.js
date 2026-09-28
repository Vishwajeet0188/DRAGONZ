// Live alerts: in-app notifications for followers + opt-in emails.
// Anti-spam: one alert per creator per follower per 3-hour window (covers stream crashes/restarts),
// enforced by unique dedupe keys in both the notifications table and the email outbox.
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { queueEmail } from './email/index.js';
import { PLATFORM_LABELS } from '../lib/platforms.js';

const { follows, users, members, notifications, notificationPreferences } = schema;
const WINDOW_MS = 3 * 3600_000;

export async function notifyStreamStarted(stream) {
  const [member] = await db.select({ id: members.id, displayName: members.displayName, slug: members.slug })
    .from(members).where(eq(members.id, stream.memberId)).limit(1);
  if (!member) return;

  const recipients = await db.select({
    userId: users.id, email: users.email, displayName: users.displayName, verified: users.emailVerifiedAt,
    emailLive: notificationPreferences.emailLiveAlerts, inApp: notificationPreferences.inAppEnabled,
  }).from(follows)
    .innerJoin(users, eq(users.id, follows.userId))
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
    .where(and(eq(follows.memberId, member.id), eq(follows.notifyLive, true), isNull(users.deletedAt)));
  if (!recipients.length) return;

  const platform = PLATFORM_LABELS[stream.platform] ?? stream.platform;
  const bucket = Math.floor(new Date(stream.startedAt).getTime() / WINDOW_MS);
  const dedupeKey = `live:${member.id}:${bucket}`;
  const title = `${member.displayName} is LIVE on ${platform}!`;

  const inAppRows = recipients.filter((r) => r.inApp !== false).map((r) => ({
    userId: r.userId, type: 'LIVE', title, body: stream.title?.slice(0, 500), url: stream.url,
    imageUrl: stream.thumbnailUrl, dedupeKey,
  }));
  if (inAppRows.length) await db.insert(notifications).values(inAppRows).onConflictDoNothing();

  let emailed = 0;
  for (const r of recipients) {
    if (!r.emailLive || !r.verified) continue; // email only to verified, opted-in users
    const queued = await queueEmail({
      to: r.email,
      template: 'liveAlert',
      data: { displayName: r.displayName, creator: member.displayName, platform, streamTitle: stream.title, url: stream.url, thumbnailUrl: stream.thumbnailUrl, profileSlug: member.slug },
      dedupeKey: `${dedupeKey}:${r.userId}`,
    });
    if (queued) emailed++;
  }
  logger.info({ member: member.slug, inApp: inAppRows.length, emailed }, 'live alerts sent');
}

