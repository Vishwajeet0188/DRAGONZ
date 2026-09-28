import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.js';
import { pageMeta, paginate } from '../../lib/util.js';
import { processImage } from '../../lib/images.js';
import { storage } from '../../services/storage.js';
import { audit } from '../../services/audit.js';

const { communitySubmissions: subs, communityMedia: media, members, users, notifications } = schema;
const PUBLIC = ['APPROVED', 'FEATURED'];
const MAX_PENDING = 5;
const MAX_PER_DAY = 10;

// Links are only accepted from well-known clip/social hosts (no arbitrary/phishing URLs).
export const LINK_HOSTS = [
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'kick.com', 'www.kick.com', 'twitch.tv', 'www.twitch.tv', 'clips.twitch.tv',
  'instagram.com', 'www.instagram.com', 'tiktok.com', 'www.tiktok.com', 'x.com', 'twitter.com', 'streamable.com', 'medal.tv', 'imgur.com', 'i.imgur.com',
];
export function isAllowedLink(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && LINK_HOSTS.includes(u.hostname.toLowerCase());
  } catch { return false; }
}
/** YouTube video id from any common URL shape (for a thumbnail preview). */
export function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12) || null;
    if (u.hostname.endsWith('youtube.com')) return u.searchParams.get('v') ?? u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] ?? null;
  } catch { /* ignore */ }
  return null;
}

async function attachMedia(rows) {
  if (!rows.length) return [];
  const m = await db.select().from(media).where(inArray(media.submissionId, rows.map((r) => r.id))).orderBy(media.createdAt);
  const by = Map.groupBy(m, (x) => x.submissionId);
  return rows.map((r) => {
    const images = (by.get(r.id) ?? []).map((x) => ({ id: x.id, url: storage.urlFor(x.storageKey), width: x.width, height: x.height }));
    const yt = r.externalUrl ? youtubeId(r.externalUrl) : null;
    return { ...r, images, previewUrl: images[0]?.url ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null) };
  });
}

const publicColumns = {
  id: subs.id, type: subs.type, title: subs.title, description: subs.description, externalUrl: subs.externalUrl,
  status: subs.status, createdAt: subs.createdAt, authorName: users.displayName,
  memberSlug: members.slug, memberName: members.displayName,
};

export async function listPublic({ type, member, page = 1, pageSize = 24, featuredFirst = true }) {
  const pg = paginate({ page, pageSize });
  const filters = [inArray(subs.status, PUBLIC), isNull(subs.deletedAt)];
  if (type) filters.push(eq(subs.type, type));
  if (member) filters.push(eq(members.slug, member));
  const where = and(...filters);
  const order = featuredFirst ? [desc(sql`(${subs.status} = 'FEATURED')`), desc(subs.moderatedAt)] : [desc(subs.moderatedAt)];
  const [rows, [{ total }]] = await Promise.all([
    db.select(publicColumns).from(subs).innerJoin(users, eq(users.id, subs.authorId)).leftJoin(members, eq(members.id, subs.featuredMemberId))
      .where(where).orderBy(...order).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(subs).leftJoin(members, eq(members.id, subs.featuredMemberId)).where(where),
  ]);
  return { data: await attachMedia(rows), meta: pageMeta(pg, total) };
}

export async function listMine(userId) {
  const rows = await db.select({ ...publicColumns, rejectionReason: subs.rejectionReason }).from(subs)
    .innerJoin(users, eq(users.id, subs.authorId)).leftJoin(members, eq(members.id, subs.featuredMemberId))
    .where(and(eq(subs.authorId, userId), isNull(subs.deletedAt))).orderBy(desc(subs.createdAt)).limit(50);
  return attachMedia(rows);
}

export async function createSubmission(user, body, files) {
  if (!user.emailVerifiedAt) throw forbidden('Verify your email before submitting to the community showcase.');
  if (!files.length && !body.externalUrl) throw badRequest('Add an image or a link to your clip', [{ field: 'externalUrl', message: 'Add a link or upload an image' }]);

  const [[{ pending }], [{ today }]] = await Promise.all([
    db.select({ pending: count() }).from(subs).where(and(eq(subs.authorId, user.id), eq(subs.status, 'PENDING'), isNull(subs.deletedAt))),
    db.select({ today: count() }).from(subs).where(and(eq(subs.authorId, user.id), gte(subs.createdAt, new Date(Date.now() - 86_400_000)))),
  ]);
  if (pending >= MAX_PENDING) throw new AppError(429, 'TOO_MANY_PENDING', `You already have ${MAX_PENDING} submissions waiting for review.`);
  if (today >= MAX_PER_DAY) throw new AppError(429, 'DAILY_LIMIT', 'Daily submission limit reached. Try again tomorrow.');

  let memberId = null;
  if (body.featuredMemberSlug) {
    const [m] = await db.select({ id: members.id }).from(members).where(and(eq(members.slug, body.featuredMemberSlug), isNull(members.deletedAt))).limit(1);
    if (!m) throw badRequest('That member does not exist', [{ field: 'featuredMemberSlug', message: 'Unknown member' }]);
    memberId = m.id;
  }

  // Validate + re-encode every image BEFORE storing anything.
  const processed = [];
  for (const f of files) processed.push(await processImage(f.buffer, 'content'));
  const stored = [];
  try {
    for (const img of processed) stored.push({ ...(await storage.save('community', img.buffer)), img });
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(subs).values({
        authorId: user.id, featuredMemberId: memberId, type: body.type, title: body.title,
        description: body.description, externalUrl: body.externalUrl,
      }).returning();
      if (stored.length) {
        await tx.insert(media).values(stored.map(({ key, img }) => ({ submissionId: row.id, storageKey: key, mimeType: img.contentType, sizeBytes: img.sizeBytes, width: img.width, height: img.height })));
      }
      return row;
    });
  } catch (err) {
    await Promise.all(stored.map((s) => storage.remove(s.key))); // no orphaned files
    throw err;
  }
}

async function removeMediaFiles(submissionId) {
  const rows = await db.delete(media).where(eq(media.submissionId, submissionId)).returning();
  await Promise.all(rows.map((r) => storage.remove(r.storageKey)));
}

export async function deleteOwn(user, id) {
  const [row] = await db.select().from(subs).where(and(eq(subs.id, id), isNull(subs.deletedAt))).limit(1);
  // Same 404 for "not yours" and "doesn't exist" — no probing other users' submissions (IDOR).
  if (!row || row.authorId !== user.id) throw notFound('Submission not found');
  await removeMediaFiles(id);
  await db.update(subs).set({ deletedAt: new Date() }).where(eq(subs.id, id));
}

// ── Moderation ────────────────────────────────────────────────────────────
export async function adminList({ status, page }) {
  const pg = paginate({ page, pageSize: 20 });
  const where = and(isNull(subs.deletedAt), status ? eq(subs.status, status) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ ...publicColumns, rejectionReason: subs.rejectionReason, authorEmail: users.email }).from(subs)
      .innerJoin(users, eq(users.id, subs.authorId)).leftJoin(members, eq(members.id, subs.featuredMemberId))
      .where(where).orderBy(desc(subs.createdAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(subs).where(where),
  ]);
  return { data: await attachMedia(rows), meta: pageMeta(pg, total) };
}

export async function moderate(actor, id, { status, rejectionReason }) {
  const [row] = await db.select().from(subs).where(and(eq(subs.id, id), isNull(subs.deletedAt))).limit(1);
  if (!row) throw notFound('Submission not found');
  const [updated] = await db.update(subs).set({
    status, rejectionReason: status === 'REJECTED' ? (rejectionReason || 'Does not meet the community guidelines') : null,
    moderatedById: actor.id, moderatedAt: new Date(),
  }).where(eq(subs.id, id)).returning();
  await db.insert(notifications).values({
    userId: row.authorId, type: 'SYSTEM',
    title: status === 'REJECTED' ? `Your submission “${row.title}” wasn’t approved` : `Your submission “${row.title}” is live${status === 'FEATURED' ? ' and featured!' : '!'}`,
    body: status === 'REJECTED' ? updated.rejectionReason : null, url: '/community', dedupeKey: `sub:${id}:${status}`,
  }).onConflictDoNothing();
  await audit(actor.id, `community.${status.toLowerCase()}`, 'submission', id, { title: row.title });
  return updated;
}

export async function adminDelete(actor, id) {
  await removeMediaFiles(id);
  await db.update(subs).set({ deletedAt: new Date() }).where(eq(subs.id, id));
  await audit(actor.id, 'community.delete', 'submission', id);
}
