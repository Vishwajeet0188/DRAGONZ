import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requirePermission } from '../../middleware/session.js';
import { submitLimiter } from '../../middleware/security.js';
import { imageUpload } from '../../lib/images.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import * as svc from './community.service.js';

const TYPES = ['CLIP', 'SCREENSHOT', 'FAN_ART', 'EDIT', 'MEME', 'VIDEO', 'MOMENT'];
const idParam = z.object({ id: z.string().uuid() });

export const communityRouter = Router();

communityRouter.get('/', validate({ query: z.object({
  type: z.enum(TYPES).optional(),
  member: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
}) }), async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(await svc.listPublic(req.validatedQuery));
});

communityRouter.get('/mine', requireAuth, async (req, res) => {
  res.json({ data: await svc.listMine(req.user.id) });
});

const submitBody = z.object({
  type: z.enum(TYPES),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional().transform((v) => v || null),
  externalUrl: z.string().trim().max(500).optional().transform((v) => v || null)
    .refine((v) => v == null || svc.isAllowedLink(v), 'Links must be https and from YouTube, Kick, Twitch, Instagram, TikTok, X, Streamable, Medal or Imgur'),
  featuredMemberSlug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional().or(z.literal('').transform(() => undefined)),
}).strict();

communityRouter.post('/', requireAuth, submitLimiter, imageUpload('images', 4), validate({ body: submitBody }), async (req, res) => {
  const row = await svc.createSubmission(req.user, req.body, req.files ?? []);
  res.status(201).json({ data: { id: row.id, status: row.status } });
});

communityRouter.delete('/:id', requireAuth, validate({ params: idParam }), async (req, res) => {
  await svc.deleteOwn(req.user, req.params.id);
  res.status(204).end();
});

// ── Moderation ───────────────────────────────────────────────────────────
export const communityAdminRouter = Router();
communityAdminRouter.use(requirePermission(P.COMMUNITY_MODERATE));
communityAdminRouter.get('/', validate({ query: z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'FEATURED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
}) }), async (req, res) => res.json(await svc.adminList(req.validatedQuery)));
communityAdminRouter.patch('/:id', validate({ params: idParam, body: z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'FEATURED', 'PENDING']),
  rejectionReason: z.string().trim().max(300).optional(),
}).strict() }), async (req, res) => res.json({ data: await svc.moderate(req.user, req.params.id, req.body) }));
communityAdminRouter.delete('/:id', validate({ params: idParam }), async (req, res) => {
  await svc.adminDelete(req.user, req.params.id);
  res.status(204).end();
});
