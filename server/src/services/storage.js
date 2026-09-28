// Media storage abstraction. Large files never go in Postgres — only their keys/URLs.
//   local: files on disk, served by the API at /media/* (dev, or hosts with a persistent disk)
//   s3:    any S3-compatible bucket (Supabase Storage, Cloudflare R2, Backblaze B2, AWS S3)
// Keys are generated server-side (folder/yyyy/mm/uuid.ext) — user input never reaches a path.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const SERVER_ROOT = path.resolve(import.meta.dirname, '../..');
export const LOCAL_DIR = path.resolve(SERVER_ROOT, env.STORAGE_LOCAL_DIR);
const FOLDERS = new Set(['avatars', 'banners', 'community', 'news', 'events', 'achievements', 'media']);

export function newKey(folder, ext) {
  if (!FOLDERS.has(folder)) throw new Error(`invalid storage folder ${folder}`);
  const d = new Date();
  return `${folder}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
}

/** Base URL every stored file is served from (used to validate "our own" media URLs too). */
export function mediaBaseUrl() {
  if (env.STORAGE_DRIVER === 's3') return env.MEDIA_PUBLIC_URL.replace(/\/+$/, '');
  return `${new URL(env.APP_URL).origin}/media`;
}

function localDriver() {
  return {
    async put(key, body) {
      const file = path.join(LOCAL_DIR, key);
      if (!file.startsWith(LOCAL_DIR + path.sep)) throw new Error('path escape');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body, { flag: 'wx' });
    },
    async remove(key) {
      const file = path.join(LOCAL_DIR, key);
      if (!file.startsWith(LOCAL_DIR + path.sep)) return;
      await unlink(file).catch(() => {});
    },
  };
}

function s3Driver() {
  let client;
  const getClient = async () => {
    if (client) return client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      // Supabase/R2/B2 don't all accept the SDK's default CRC checksums — only send them when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
    return client;
  };
  return {
    async put(key, body, contentType) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await (await getClient()).send(new PutObjectCommand({
        Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
    },
    async remove(key) {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await (await getClient()).send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })).catch((err) => logger.warn({ err: err.message }, 'S3 delete failed'));
    },
  };
}

const driver = env.STORAGE_DRIVER === 's3' ? s3Driver() : localDriver();

export const storage = {
  /** Store bytes under a fresh key; returns { key, url }. */
  async save(folder, body, { ext = 'webp', contentType = 'image/webp' } = {}) {
    const key = newKey(folder, ext);
    await driver.put(key, body, contentType);
    return { key, url: `${mediaBaseUrl()}/${key}` };
  },
  remove: (key) => driver.remove(key),
  urlFor: (key) => `${mediaBaseUrl()}/${key}`,
};
