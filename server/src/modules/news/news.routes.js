// News & announcements. Content is Markdown; the client renders it with react-markdown
// (no raw HTML), so stored content can never inject scripts.
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, isNull, ne } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/session.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { notFound } from '../../lib/errors.js';
import { optionalMediaUrl, optionalText } from '../../lib/validators.js';
import { compact, pageMeta, paginate, uniqueSlug } from '../../lib/util.js';
import { audit } from '../../services/audit.js';

const { newsPosts, users } = schema;
const CATEGORIES = ['ANNOUNCEMENT', 'RECRUITMENT', 'COMMUNITY', 'NOTICE'];
const listColumns = {
  id: newsPosts.id, slug: newsPosts.slug, title: newsPosts.title, excerpt: newsPosts.excerpt, category: newsPosts.category,
  featuredImageUrl: newsPosts.featuredImageUrl, isPinned: newsPosts.isPinned, publishedAt: newsPosts.publishedAt, status: newsPosts.status,
};
const published = and(eq(newsPosts.status, 'PUBLISHED'), isNull(newsPosts.deletedAt));

export const newsRouter = Router();
newsRouter.get('/', validate({ query: z.object({
  category: z.enum(CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(10),
}) }), async (req, res) => {
  const { category, ...p } = req.validatedQuery;
  const pg = paginate(p);
  const where = category ? and(published, eq(newsPosts.category, category)) : published;
  const [rows, [{ total }]] = await Promise.all([
    db.select(listColumns).from(newsPosts).where(where).orderBy(desc(newsPosts.isPinned), desc(newsPosts.publishedAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(newsPosts).where(where),
  ]);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ data: rows, meta: pageMeta(pg, total) });
});

newsRouter.get('/:slug', validate({ params: z.object({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/) }) }), async (req, res) => {
  const [post] = await db.select({ ...listColumns, content: newsPosts.content, authorName: users.displayName })
    .from(newsPosts).leftJoin(users, eq(users.id, newsPosts.authorId))
    .where(and(published, eq(newsPosts.slug, req.params.slug))).limit(1);
  if (!post) throw notFound('Post not found');
  const more = await db.select(listColumns).from(newsPosts).where(and(published, ne(newsPosts.id, post.id))).orderBy(desc(newsPosts.publishedAt)).limit(3);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ data: { ...post, more } });
});

// ── Admin ────────────────────────────────────────────────────────────────
const postBody = z.object({
  title: z.string().trim().min(3).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional().or(z.literal('').transform(() => undefined)),
  excerpt: optionalText(300),
  content: z.string().trim().min(1).max(50_000),
  featuredImageUrl: optionalMediaUrl,
  category: z.enum(CATEGORIES).default('ANNOUNCEMENT'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  isPinned: z.boolean().default(false),
}).strict();
const idParam = z.object({ id: z.string().uuid() });

async function getPost(id) {
  const [p] = await db.select().from(newsPosts).where(and(eq(newsPosts.id, id), isNull(newsPosts.deletedAt))).limit(1);
  if (!p) throw notFound('Post not found');
  return p;
}

export const newsAdminRouter = Router();
newsAdminRouter.use(requirePermission(P.NEWS_MANAGE));
newsAdminRouter.get('/', validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1) }) }), async (req, res) => {
  const pg = paginate({ page: req.validatedQuery.page, pageSize: 20 });
  const where = isNull(newsPosts.deletedAt);
  const [rows, [{ total }]] = await Promise.all([
    db.select(listColumns).from(newsPosts).where(where).orderBy(desc(newsPosts.updatedAt)).limit(pg.limit).offset(pg.offset),
    db.select({ total: count() }).from(newsPosts).where(where),
  ]);
  res.json({ data: rows, meta: pageMeta(pg, total) });
});
newsAdminRouter.get('/:id', validate({ params: idParam }), async (req, res) => res.json({ data: await getPost(req.params.id) }));
newsAdminRouter.post('/', validate({ body: postBody }), async (req, res) => {
  const slug = await uniqueSlug(db, newsPosts, req.body.slug || req.body.title);
  const [row] = await db.insert(newsPosts).values({
    ...req.body, slug, authorId: req.user.id, publishedAt: req.body.status === 'PUBLISHED' ? new Date() : null,
  }).returning();
  await audit(req.user.id, 'news.create', 'news', row.id, { title: row.title, status: row.status });
  res.status(201).json({ data: row });
});
newsAdminRouter.patch('/:id', validate({ params: idParam, body: postBody }), async (req, res) => {
  const current = await getPost(req.params.id);
  const changes = compact(req.body);
  if (changes.slug) changes.slug = await uniqueSlug(db, newsPosts, changes.slug, current.id);
  if (changes.status === 'PUBLISHED' && !current.publishedAt) changes.publishedAt = new Date();
  const [row] = await db.update(newsPosts).set(changes).where(eq(newsPosts.id, current.id)).returning();
  await audit(req.user.id, 'news.update', 'news', row.id, { fields: Object.keys(changes) });
  res.json({ data: row });
});
newsAdminRouter.delete('/:id', validate({ params: idParam }), async (req, res) => {
  const p = await getPost(req.params.id);
  await db.update(newsPosts).set({ deletedAt: new Date(), slug: `deleted-${p.id}` }).where(eq(newsPosts.id, p.id));
  await audit(req.user.id, 'news.delete', 'news', p.id);
  res.status(204).end();
});
