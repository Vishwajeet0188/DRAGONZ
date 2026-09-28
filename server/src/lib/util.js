import { randomBytes } from 'node:crypto';

export function slugify(input) {
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || randomBytes(4).toString('hex');
}

/** Escape user input for use inside a SQL LIKE/ILIKE pattern (value itself is still parameterised). */
export const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function paginate({ page = 1, pageSize = 12 }) {
  const size = Math.min(Math.max(pageSize, 1), 48);
  const p = Math.max(page, 1);
  return { limit: size, offset: (p - 1) * size, page: p, pageSize: size };
}

export const pageMeta = ({ page, pageSize }, total) => ({
  page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

/** Drop keys whose value is undefined (for PATCH updates). */
export const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Find a free slug in `table.slug` (appends -2, -3… on collision). */
export async function uniqueSlug(db, table, base, excludeId) {
  const { eq } = await import('drizzle-orm');
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i ? `${root}-${i + 1}` : root;
    const [hit] = await db.select({ id: table.id }).from(table).where(eq(table.slug, candidate)).limit(1);
    if (!hit || hit.id === excludeId) return candidate;
  }
  return `${root}-${randomBytes(3).toString('hex')}`;
}
