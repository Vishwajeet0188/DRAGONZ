import { and, count, desc, asc, eq, ilike, isNull, isNotNull, or, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { escapeLike, paginate, pageMeta, slugify, compact } from '../../lib/util.js';
import { audit } from '../../services/audit.js';

const { members, platformAccounts, users, liveStreams, communitySubmissions, events, auditLogs, follows } = schema;

// ── Dashboard ─────────────────────────────────────────────────────────────
export async function getStats() {
  const [[m], [c], [u], [l], [pending], [upcoming], [f], recent] = await Promise.all([
    db.select({ n: count() }).from(members).where(isNull(members.deletedAt)),
    db.select({ n: count() }).from(members).where(and(isNull(members.deletedAt), eq(members.isCreator, true))),
    db.select({ n: count() }).from(users).where(isNull(users.deletedAt)),
    db.select({ n: count() }).from(liveStreams).where(eq(liveStreams.isLive, true)),
    db.select({ n: count() }).from(communitySubmissions).where(and(eq(communitySubmissions.status, 'PENDING'), isNull(communitySubmissions.deletedAt))),
    db.select({ n: count() }).from(events).where(and(inArray(events.status, ['SCHEDULED', 'LIVE']), gte(events.startsAt, new Date()), isNull(events.deletedAt))),
    db.select({ n: count() }).from(follows),
    listAuditLogs({ page: 1, pageSize: 8 }).then((r) => r.data),
  ]);
  return {
    totals: { members: m.n, creators: c.n, users: u.n, liveNow: l.n, pendingSubmissions: pending.n, upcomingEvents: upcoming.n, follows: f.n },
    recentActivity: recent,
  };
}

// ── Members ───────────────────────────────────────────────────────────────
export async function listMembersAdmin({ q, status, creator, page, pageSize }) {
  const pg = paginate({ page, pageSize });
  const filters = [isNull(members.deletedAt)];
  if (q) filters.push(or(ilike(members.displayName, `%${escapeLike(q)}%`), ilike(members.rpCharacter, `%${escapeLike(q)}%`)));
  if (status) filters.push(eq(members.status, status));
  if (creator !== undefined) filters.push(eq(members.isCreator, creator));
  const where = and(...filters);
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(members).where(where).orderBy(asc(members.rankOrder), asc(members.displayName)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(members).where(where),
  ]);
  const plats = rows.length ? await db.select().from(platformAccounts).where(inArray(platformAccounts.memberId, rows.map((r) => r.id))) : [];
  const by = Map.groupBy(plats, (p) => p.memberId);
  return { data: rows.map((r) => ({ ...r, platforms: by.get(r.id) ?? [] })), meta: pageMeta(pg, total) };
}

export async function getMemberAdmin(id) {
  const [row] = await db.select().from(members).where(and(eq(members.id, id), isNull(members.deletedAt))).limit(1);
  if (!row) throw notFound('Member not found');
  const plats = await db.select().from(platformAccounts).where(eq(platformAccounts.memberId, id));
  return { ...row, platforms: plats };
}

async function uniqueSlug(base, excludeId) {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i ? `${root}-${i + 1}` : root;
    const [hit] = await db.select({ id: members.id }).from(members).where(eq(members.slug, candidate)).limit(1);
    if (!hit || hit.id === excludeId) return candidate;
  }
  throw conflict('Could not generate a unique slug');
}

export async function createMember(actor, body) {
  if (body.slug) {
    const [hit] = await db.select({ id: members.id }).from(members).where(eq(members.slug, body.slug)).limit(1);
    if (hit) throw conflict('Slug already in use', [{ field: 'slug', message: 'Already in use' }]);
  }
  const slug = body.slug ?? (await uniqueSlug(body.displayName));
  const [row] = await db.insert(members).values({ ...body, slug }).returning();
  await audit(actor.id, 'member.create', 'member', row.id, { displayName: row.displayName, slug });
  return row;
}

export async function updateMember(actor, id, patch) {
  const existing = await getMemberAdmin(id);
  if (patch.slug && patch.slug !== existing.slug) {
    const [hit] = await db.select({ id: members.id }).from(members).where(eq(members.slug, patch.slug)).limit(1);
    if (hit) throw conflict('Slug already in use', [{ field: 'slug', message: 'Already in use' }]);
  }
  const changes = compact(patch);
  const [row] = await db.update(members).set(changes).where(eq(members.id, id)).returning();
  await audit(actor.id, 'member.update', 'member', id, { fields: Object.keys(changes) });
  return row;
}

export async function deleteMember(actor, id) {
  await getMemberAdmin(id);
  // Soft delete; slug is released so it can be reused.
  await db.update(members).set({ deletedAt: new Date(), isFeatured: false, slug: `deleted-${id}` }).where(eq(members.id, id));
  await audit(actor.id, 'member.delete', 'member', id);
}

/** Replace the full set of platform accounts for a member (idempotent PUT). */
export async function setPlatforms(actor, id, platforms) {
  await getMemberAdmin(id);
  let primarySeen = false;
  const rows = platforms.map((p) => {
    const isPrimary = p.isPrimary && !primarySeen;
    primarySeen ||= isPrimary;
    return { ...p, memberId: id, isPrimary };
  });
  await db.transaction(async (tx) => {
    const keep = rows.map((r) => r.platform);
    const current = await tx.select().from(platformAccounts).where(eq(platformAccounts.memberId, id));
    const removeIds = current.filter((c) => !keep.includes(c.platform)).map((c) => c.id);
    if (removeIds.length) await tx.delete(platformAccounts).where(inArray(platformAccounts.id, removeIds));
    for (const r of rows) {
      await tx.insert(platformAccounts).values(r)
        .onConflictDoUpdate({
          target: [platformAccounts.memberId, platformAccounts.platform],
          set: {
            handle: r.handle,
            url: r.url,
            // Keep the channel id the sync resolved (saves API quota) unless the handle/URL actually changed.
            externalId: sql`case when ${platformAccounts.handle} = excluded.handle and ${platformAccounts.url} = excluded.url then coalesce(excluded.external_id, ${platformAccounts.externalId}) else excluded.external_id end`,
            syncError: sql`case when ${platformAccounts.handle} = excluded.handle and ${platformAccounts.url} = excluded.url then ${platformAccounts.syncError} else null end`,
            isPrimary: r.isPrimary,
            followerCount: r.followerCount ?? null,
            syncEnabled: r.syncEnabled,
            updatedAt: new Date(),
          },
        });
    }
  });
  await audit(actor.id, 'member.platforms_update', 'member', id, { platforms: rows.map((r) => r.platform) });
  return db.select().from(platformAccounts).where(eq(platformAccounts.memberId, id));
}

// ── Users ─────────────────────────────────────────────────────────────────
const adminUserColumns = {
  id: users.id, email: users.email, displayName: users.displayName, role: users.role,
  emailVerifiedAt: users.emailVerifiedAt, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt, lockedUntil: users.lockedUntil,
};

export async function listUsers({ q, role, page, pageSize }) {
  const pg = paginate({ page, pageSize });
  const filters = [isNull(users.deletedAt)];
  if (q) filters.push(or(ilike(users.email, `%${escapeLike(q)}%`), ilike(users.displayName, `%${escapeLike(q)}%`)));
  if (role) filters.push(eq(users.role, role));
  const where = and(...filters);
  const [rows, [{ total }]] = await Promise.all([
    db.select(adminUserColumns).from(users).where(where).orderBy(desc(users.createdAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(users).where(where),
  ]);
  return { data: rows, meta: pageMeta(pg, total) };
}

export async function changeRole(actor, targetId, role) {
  if (actor.id === targetId) throw forbidden('You cannot change your own role');
  const [target] = await db.select().from(users).where(and(eq(users.id, targetId), isNull(users.deletedAt))).limit(1);
  if (!target) throw notFound('User not found');
  if (target.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
    const [{ n }] = await db.select({ n: count() }).from(users).where(and(eq(users.role, 'SUPER_ADMIN'), isNull(users.deletedAt)));
    if (n <= 1) throw badRequest('Cannot demote the last super-admin');
  }
  const [row] = await db.update(users).set({ role }).where(eq(users.id, targetId)).returning(adminUserColumns);
  // Force re-authentication so the new privilege level applies cleanly.
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, targetId));
  await audit(actor.id, 'user.role_change', 'user', targetId, { from: target.role, to: role });
  return row;
}

// ── Audit ─────────────────────────────────────────────────────────────────
export async function listAuditLogs({ page, pageSize }) {
  const pg = paginate({ page, pageSize });
  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId,
      metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actorName: users.displayName,
    }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId))
      .orderBy(desc(auditLogs.createdAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(auditLogs).where(isNotNull(auditLogs.id)),
  ]);
  return { data: rows, meta: pageMeta(pg, total) };
}
