import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { PLATFORMS } from '../../db/schema.js';
import * as members from './members.service.js';

export const membersRouter = Router();

const boolParam = z.enum(['true', 'false']).transform((v) => v === 'true');

const listQuery = z.object({
  q: z.string().trim().max(60).optional(),
  rank: z.string().trim().max(40).optional(),
  creator: boolParam.optional(),
  live: boolParam.optional(),
  platform: z.enum(PLATFORMS).optional(),
  sort: z.enum(['rank', 'name', 'newest']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

membersRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  res.json(await members.listMembers(req.validatedQuery));
});

membersRouter.get('/ranks', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ data: await members.listRanks() });
});

membersRouter.get('/:slug', validate({ params: z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }) }), async (req, res) => {
  res.set('Cache-Control', 'private, no-cache');
  res.json({ data: await members.getMemberProfile(req.params.slug, req.user?.id) });
});
