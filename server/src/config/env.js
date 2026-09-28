import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url(),
  CORS_ORIGINS: z.string().optional().default(''),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  EMAIL_PROVIDER: z.enum(['console', 'resend', 'smtp']).default('console'),
  EMAIL_API_KEY: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Dragonz Central <no-reply@example.com>'),
  STREAMING_MODE: z.enum(['mock', 'live']).default('mock'),
  YOUTUBE_API_KEY: z.string().optional().default(''),
  TWITCH_CLIENT_ID: z.string().optional().default(''),
  TWITCH_CLIENT_SECRET: z.string().optional().default(''),
  KICK_CLIENT_ID: z.string().optional().default(''),
  KICK_CLIENT_SECRET: z.string().optional().default(''),
  // How often the live/video sync runs (seconds). Min 60 to protect API quotas.
  SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(3600).default(180),
  // Daily YouTube quota you have (10,000 by default for new Google Cloud projects).
  YOUTUBE_DAILY_QUOTA: z.coerce.number().int().min(100).default(10000),
  // Media storage: local disk (dev / hosts with persistent disks) or any S3-compatible bucket.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  MEDIA_PUBLIC_URL: z.string().optional().default(''),
  // Secret for /api/cron/tick (external scheduler keeps free hosts syncing). Empty = endpoint disabled.
  CRON_SECRET: z.string().optional().default(''),
  DISABLE_RATE_LIMIT: bool.optional().default('false'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print only variable names + messages, never values.
  console.error('✖ Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production') {
  const problems = [];
  if (env.STREAMING_MODE === 'mock') problems.push('STREAMING_MODE=mock is not allowed in production');
  if (env.EMAIL_PROVIDER === 'console') console.warn('⚠ EMAIL_PROVIDER=console in production: verification/alert emails will NOT be delivered.');
  if (env.EMAIL_PROVIDER === 'smtp' && !(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)) problems.push('EMAIL_PROVIDER=smtp needs SMTP_HOST, SMTP_USER and SMTP_PASS');
  if (env.STORAGE_DRIVER === 's3' && !(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.MEDIA_PUBLIC_URL)) problems.push('STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and MEDIA_PUBLIC_URL');
  if (env.CRON_SECRET && env.CRON_SECRET.length < 24) problems.push('CRON_SECRET must be at least 24 characters');
  if (env.STORAGE_DRIVER === 'local') console.warn('⚠ STORAGE_DRIVER=local in production: uploads are lost on hosts with ephemeral disks (Render free). Use s3.');
  if (env.DISABLE_RATE_LIMIT) problems.push('DISABLE_RATE_LIMIT cannot be true in production');
  if (!env.APP_URL.startsWith('https://')) problems.push('APP_URL must be https in production');
  if (problems.length) {
    console.error('✖ Unsafe production configuration:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const allowedOrigins = [new URL(env.APP_URL).origin, ...env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)];
export { env };
