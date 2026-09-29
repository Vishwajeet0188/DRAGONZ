import { z } from 'zod';
import { PLATFORMS } from '../../db/schema.js';
import { isPlatformUrl } from '../../lib/platforms.js';
import { optionalMediaUrl } from '../../lib/validators.js';

const optionalText = (max) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));

export const memberBody = z.object({
  displayName: z.string().trim().min(2).max(60),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and dashes').max(80).optional(),
  rank: z.string().trim().min(2).max(40),
  rankOrder: z.coerce.number().int().min(0).max(1000).default(100),
  rpCharacter: optionalText(80),
  tagline: optionalText(140),
  bio: optionalText(5000),
  avatarUrl: optionalMediaUrl,
  bannerUrl: optionalMediaUrl,
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex colour like #e11d2e').nullable().optional().or(z.literal('').transform(() => null)),
  isCreator: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALUMNI']).default('ACTIVE'),
  joinedAt: z.coerce.date().nullable().optional(),
  // Birthday without a year (privacy). Both or neither; empty string clears.
  birthMonth: z.coerce.number().int().min(1).max(12).nullable().optional().or(z.literal('').transform(() => null)),
  birthDay: z.coerce.number().int().min(1).max(31).nullable().optional().or(z.literal('').transform(() => null)),
}).strict().refine((b) => (b.birthMonth == null) === (b.birthDay == null), { message: 'Set both month and day, or neither', path: ['birthDay'] })
  .refine((b) => !b.birthMonth || !b.birthDay || b.birthDay <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][b.birthMonth - 1], { message: 'That day does not exist in this month', path: ['birthDay'] });

export const memberPatch = memberBody.innerType().innerType().partial().strict();

export const platformsBody = z.object({
  platforms: z.array(z.object({
    platform: z.enum(PLATFORMS),
    handle: z.string().trim().min(1).max(100),
    url: z.string().trim().url().max(500),
    externalId: z.string().trim().max(100).nullable().optional().transform((v) => v || null),
    isPrimary: z.boolean().default(false),
    followerCount: z.coerce.number().int().min(0).nullable().optional(),
    syncEnabled: z.boolean().default(true),
  }).refine((p) => isPlatformUrl(p.platform, p.url), { message: 'URL must be an https link on the official platform domain', path: ['url'] }))
    .max(PLATFORMS.length)
    .refine((arr) => new Set(arr.map((p) => p.platform)).size === arr.length, 'Each platform can only be added once'),
}).strict();

export const listQuery = z.object({
  q: z.string().trim().max(60).optional(),
  creator: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALUMNI']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(20),
});

export const usersQuery = listQuery.extend({
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'USER']).optional(),
}).omit({ status: true });

export const roleBody = z.object({ role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'USER']) }).strict();
export const idParam = z.object({ id: z.string().uuid() });
