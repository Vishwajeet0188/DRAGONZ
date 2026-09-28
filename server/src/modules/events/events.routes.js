import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requirePermission } from '../../middleware/session.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import { httpsUrl, optionalMediaUrl } from '../../lib/validators.js';
import * as svc from './events.service.js';

const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/) });
const pageQ = { page: z.coerce.number().int().min(1).max(500).default(1), pageSize: z.coerce.number().int().min(1).max(48).default(12) };

export const eventsRouter = Router();
eventsRouter.get('/', validate({ query: z.object({ when: z.enum(['upcoming', 'past']).default('upcoming'), ...pageQ }) }), async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(await svc.listEvents(req.validatedQuery));
});
eventsRouter.get('/:slug', validate({ params: slugParam }), async (req, res) => {
  res.set('Cache-Control', 'private, no-cache');
  res.json({ data: await svc.getEvent(req.params.slug, req.user?.id) });
});
eventsRouter.get('/:slug/ics', validate({ params: slugParam }), async (req, res) => {
  const { filename, body } = await svc.eventIcs(req.params.slug);
  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
  res.send(body);
});
eventsRouter.put('/:slug/reminder', requireAuth, validate({ params: slugParam }), async (req, res) => {
  res.json({ data: await svc.setReminder(req.params.slug, req.user.id, true) });
});
eventsRouter.delete('/:slug/reminder', requireAuth, validate({ params: slugParam }), async (req, res) => {
  res.json({ data: await svc.setReminder(req.params.slug, req.user.id, false) });
});

// ── Admin ────────────────────────────────────────────────────────────────
const eventBody = z.object({
  title: z.string().trim().min(3).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional().or(z.literal('').transform(() => undefined)),
  description: z.string().trim().min(1).max(10_000),
  category: z.string().trim().min(2).max(40),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  bannerUrl: optionalMediaUrl,
  streamUrl: httpsUrl.nullable().optional().or(z.literal('').transform(() => null)),
  externalUrl: httpsUrl.nullable().optional().or(z.literal('').transform(() => null)),
  status: z.enum(['DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED']).default('SCHEDULED'),
  organizerMemberId: z.string().uuid().nullable().optional().or(z.literal('').transform(() => null)),
}).strict().refine((b) => !b.endsAt || b.endsAt > b.startsAt, { message: 'End must be after start', path: ['endsAt'] });
const idParam = z.object({ id: z.string().uuid() });

export const eventsAdminRouter = Router();
eventsAdminRouter.use(requirePermission(P.EVENTS_MANAGE));
eventsAdminRouter.get('/', validate({ query: z.object(pageQ) }), async (req, res) => res.json(await svc.adminListEvents(req.validatedQuery)));
eventsAdminRouter.get('/:id', validate({ params: idParam }), async (req, res) => res.json({ data: await svc.adminGetEvent(req.params.id) }));
eventsAdminRouter.post('/', validate({ body: eventBody }), async (req, res) => res.status(201).json({ data: await svc.createEvent(req.user, req.body) }));
eventsAdminRouter.patch('/:id', validate({ params: idParam, body: eventBody }), async (req, res) => res.json({ data: await svc.updateEvent(req.user, req.params.id, req.body) }));
eventsAdminRouter.delete('/:id', validate({ params: idParam }), async (req, res) => { await svc.deleteEvent(req.user, req.params.id); res.status(204).end(); });
