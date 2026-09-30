import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/session.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';
import * as v from './admin.validators.js';
import * as admin from './admin.service.js';
import * as integrations from './integrations.service.js';
import { requestSync } from '../../integrations/index.js';
import { sensitiveLimiter } from '../../middleware/security.js';
import { adminUploadsRouter } from '../uploads/uploads.routes.js';
import { eventsAdminRouter } from '../events/events.routes.js';
import { newsAdminRouter } from '../news/news.routes.js';
import { communityAdminRouter } from '../community/community.routes.js';
import { videosAdminRouter } from '../media/media.routes.js';
import { achievementsAdminRouter } from '../achievements/achievements.routes.js';
import { supportersAdminRouter } from '../supporters/supporters.routes.js';
import { platformAdminRouter } from './platform.routes.js';
import { pollsAdminRouter } from '../fanzone/polls.js';
import { crewAdminRouter } from '../crew/crew.routes.js';
import { applicationsAdminRouter } from '../fanzone/recruitment.js';
import { quotesAdminRouter } from '../fanzone/quotes.js';
import { commentsAdminRouter } from '../fanzone/social.js';

export const adminRouter = Router();

// Every admin route requires admin panel access; each route then checks its own granular permission.
adminRouter.use(requirePermission(P.ADMIN_ACCESS));
adminRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

adminRouter.get('/stats', requirePermission(P.STATS_READ), async (_req, res) => {
  res.json({ data: await admin.getStats() });
});

// Members
const canMembers = requirePermission(P.MEMBERS_MANAGE);
adminRouter.get('/members', requirePermission(P.ADMIN_ACCESS), validate({ query: v.listQuery }), async (req, res) => {
  res.json(await admin.listMembersAdmin(req.validatedQuery));
});
adminRouter.get('/members/:id', canMembers, validate({ params: v.idParam }), async (req, res) => {
  res.json({ data: await admin.getMemberAdmin(req.params.id) });
});
adminRouter.post('/members', canMembers, validate({ body: v.memberBody }), async (req, res) => {
  const data = await admin.createMember(req.user, req.body);
  requestSync();
  res.status(201).json({ data });
});
adminRouter.patch('/members/:id', canMembers, validate({ params: v.idParam, body: v.memberPatch }), async (req, res) => {
  res.json({ data: await admin.updateMember(req.user, req.params.id, req.body) });
});
adminRouter.delete('/members/:id', canMembers, validate({ params: v.idParam }), async (req, res) => {
  await admin.deleteMember(req.user, req.params.id);
  res.status(204).end();
});
adminRouter.put('/members/:id/platforms', requirePermission(P.MEMBERS_MANAGE, P.CREATORS_MANAGE), validate({ params: v.idParam, body: v.platformsBody }), async (req, res) => {
  const data = await admin.setPlatforms(req.user, req.params.id, req.body.platforms);
  requestSync(); // fetch the new channels' photo, subscribers, videos and live status within seconds
  res.json({ data });
});

// Users
adminRouter.get('/users', requirePermission(P.USERS_READ), validate({ query: v.usersQuery }), async (req, res) => {
  res.json(await admin.listUsers(req.validatedQuery));
});
adminRouter.patch('/users/:id/role', requirePermission(P.USERS_MANAGE_ROLES), validate({ params: v.idParam, body: v.roleBody }), async (req, res) => {
  res.json({ data: await admin.changeRole(req.user, req.params.id, req.body.role) });
});

// Audit logs
adminRouter.get('/audit-logs', requirePermission(P.AUDIT_READ), validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30) }) }), async (req, res) => {
  res.json(await admin.listAuditLogs(req.validatedQuery));
});

// Live integrations (YouTube / Kick sync)
const canLive = requirePermission(P.LIVE_MANAGE);
adminRouter.get('/integrations', canLive, async (_req, res) => {
  res.json({ data: await integrations.getIntegrationsOverview() });
});
adminRouter.post('/integrations/sync', canLive, sensitiveLimiter, validate({ body: z.object({ platform: z.enum(['YOUTUBE', 'KICK']).optional() }).strict() }), async (req, res) => {
  res.json({ data: await integrations.syncNow(req.user, req.body.platform) });
});
adminRouter.post('/integrations/kick/subscribe', canLive, sensitiveLimiter, async (req, res) => {
  res.json({ data: await integrations.subscribeKickWebhooks(req.user) });
});

// Content & platform sections (each router enforces its own granular permission).
adminRouter.use('/uploads', adminUploadsRouter);
adminRouter.use('/events', eventsAdminRouter);
adminRouter.use('/news', newsAdminRouter);
adminRouter.use('/community', communityAdminRouter);
adminRouter.use('/videos', videosAdminRouter);
adminRouter.use('/supporters', supportersAdminRouter);
adminRouter.use(achievementsAdminRouter); // /achievements, /milestones
adminRouter.use(platformAdminRouter); // /announcements, /analytics, /settings
adminRouter.use('/polls', pollsAdminRouter);
adminRouter.use('/crew', crewAdminRouter);
adminRouter.use('/applications', applicationsAdminRouter);
adminRouter.use('/quotes', quotesAdminRouter);
adminRouter.use('/comments', commentsAdminRouter);
