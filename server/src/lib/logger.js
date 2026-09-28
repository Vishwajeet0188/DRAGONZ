import pino from 'pino';
import { env, isProd } from '../config/env.js';

// Structured JSON logs in production; pretty logs in development.
// Secrets are redacted at the logger level so a mistake in a call site cannot leak them.
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password', '*.currentPassword', '*.newPassword', '*.passwordHash', '*.token', '*.tokenHash',
      '*.apiKey', '*.secret',
    ],
    censor: '[REDACTED]',
  },
  ...(isProd || env.NODE_ENV === 'test'
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }),
});
