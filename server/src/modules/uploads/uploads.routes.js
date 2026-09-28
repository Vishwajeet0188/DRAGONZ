// Image uploads for admins (member avatars/banners, news & event images) and users (own avatar).
import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { requireAnyPermission, requireAuth, publicUser } from '../../middleware/session.js';
import { validate } from '../../middleware/validate.js';
import { uploadLimiter } from '../../middleware/security.js';
import { imageUpload, processImage } from '../../lib/images.js';
import { badRequest } from '../../lib/errors.js';
import { storage } from '../../services/storage.js';
import { audit } from '../../services/audit.js';
import { PERMISSIONS as P } from '../../auth/permissions.js';

const KINDS = {
  avatar: { folder: 'avatars', preset: 'avatar' },
  banner: { folder: 'banners', preset: 'banner' },
  news: { folder: 'news', preset: 'banner' },
  event: { folder: 'events', preset: 'banner' },
  achievement: { folder: 'achievements', preset: 'content' },
  content: { folder: 'media', preset: 'content' },
};

export const adminUploadsRouter = Router();
adminUploadsRouter.post('/',
  requireAnyPermission(P.MEMBERS_MANAGE, P.NEWS_MANAGE, P.EVENTS_MANAGE, P.ACHIEVEMENTS_MANAGE, P.VIDEOS_MANAGE),
  uploadLimiter,
  imageUpload('file', 1),
  validate({ body: z.object({ kind: z.enum(Object.keys(KINDS)) }) }),
  async (req, res) => {
    const file = req.files?.[0];
    if (!file) throw badRequest('Choose an image to upload');
    const kind = KINDS[req.body.kind];
    const img = await processImage(file.buffer, kind.preset);
    const { url } = await storage.save(kind.folder, img.buffer);
    await audit(req.user.id, 'media.upload', 'media', null, { kind: req.body.kind, bytes: img.sizeBytes });
    res.status(201).json({ data: { url, width: img.width, height: img.height } });
  });

export const meAvatarRouter = Router();
meAvatarRouter.post('/', requireAuth, uploadLimiter, imageUpload('file', 1), async (req, res) => {
  const file = req.files?.[0];
  if (!file) throw badRequest('Choose an image to upload');
  const img = await processImage(file.buffer, 'avatar');
  const { url } = await storage.save('avatars', img.buffer);
  const [user] = await db.update(schema.users).set({ avatarUrl: url }).where(eq(schema.users.id, req.user.id)).returning();
  res.status(201).json({ data: { user: publicUser(user) } });
});
