// Fan progress (XP, level, badges, streak), daily check-in, leaderboard, and crew celebrations.
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/session.js';
import { BADGES, LEVELS, XP, checkIn, leaderboard, progressFor } from '../../services/xp.js';

const { members } = schema;

export const fansRouter = Router();
fansRouter.get('/leaderboard', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }) }), async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ data: await leaderboard(req.validatedQuery.limit) });
});
// How XP works — shown on the Fan Zone page.
fansRouter.get('/guide', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ data: { xp: XP, levels: LEVELS, badges: BADGES.map(({ key, name, icon, description }) => ({ key, name, icon, description })) } });
});

export const meFanRouter = Router();
meFanRouter.use(requireAuth);
meFanRouter.get('/progress', async (req, res) => res.json({ data: await progressFor(req.user.id) }));
meFanRouter.post('/checkin', async (req, res) => res.json({ data: await checkIn(req.user.id) }));

/**
 * Crew anniversaries (joinedAt) and birthdays (month/day only) happening today or in the next `days` days.
 * India time, so "today" matches the audience's calendar.
 */
export async function celebrations(days = 7) {
  const rows = await db.select({
    id: members.id, slug: members.slug, displayName: members.displayName, avatarUrl: members.avatarUrl, accentColor: members.accentColor,
    rank: members.rank, joinedAt: members.joinedAt, birthMonth: members.birthMonth, birthDay: members.birthDay,
  }).from(members).where(and(isNull(members.deletedAt), eq(members.status, 'ACTIVE'),
    or(isNotNull(members.joinedAt), and(isNotNull(members.birthMonth), isNotNull(members.birthDay)))));

  const now = new Date(Date.now() + 5.5 * 3_600_000);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const upcoming = (month, day) => {
    // next occurrence of month/day from today (Feb 29 → Feb 28 in non-leap years)
    for (const y of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      let d = Date.UTC(y, month - 1, day);
      if (new Date(d).getUTCMonth() !== month - 1) d = Date.UTC(y, month - 1, 28);
      if (d >= today) return { date: d, inDays: Math.round((d - today) / 86_400_000), year: y };
    }
    return null;
  };

  const out = [];
  for (const m of rows) {
    const mini = { slug: m.slug, displayName: m.displayName, avatarUrl: m.avatarUrl, accentColor: m.accentColor, rank: m.rank };
    if (m.birthMonth && m.birthDay) {
      const u = upcoming(m.birthMonth, m.birthDay);
      if (u && u.inDays <= days) out.push({ kind: 'birthday', member: mini, inDays: u.inDays, date: new Date(u.date).toISOString().slice(0, 10) });
    }
    if (m.joinedAt) {
      const j = new Date(new Date(m.joinedAt).getTime() + 5.5 * 3_600_000);
      const u = upcoming(j.getUTCMonth() + 1, j.getUTCDate());
      const years = u ? u.year - j.getUTCFullYear() : 0;
      if (u && years >= 1 && u.inDays <= days) out.push({ kind: 'anniversary', member: mini, years, inDays: u.inDays, date: new Date(u.date).toISOString().slice(0, 10) });
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays || a.member.displayName.localeCompare(b.member.displayName));
}
