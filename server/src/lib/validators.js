import { z } from 'zod';

/** https-only URL (blocks javascript:, data:, http: links from being stored and rendered). */
export const httpsUrl = z.string().trim().url().max(500)
  .refine((u) => u.startsWith('https://'), 'Must be an https:// URL');

/** https URL, or a URL of a file we stored ourselves (http in local dev). */
export const mediaUrl = z.string().trim().max(500).refine((u) => {
  if (/^https:\/\//.test(u)) { try { new URL(u); return true; } catch { return false; } }
  return u.startsWith(`${mediaBase()}/`);
}, 'Must be an https:// URL or an uploaded image');

let _base;
function mediaBase() {
  // Computed lazily from process.env so this module stays free of the config import.
  return (_base ??= process.env.STORAGE_DRIVER === 's3'
    ? String(process.env.MEDIA_PUBLIC_URL || '').replace(/\/+$/, '')
    : `${new URL(process.env.APP_URL).origin}/media`);
}

/** Optional text that turns '' into null. */
export const optionalText = (max) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));
export const optionalMediaUrl = mediaUrl.nullable().optional().or(z.literal('').transform(() => null));
