import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Body parser errors
  if (err.type === 'entity.too.large') err = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  else if (err.type === 'entity.parse.failed') err = new AppError(400, 'BAD_JSON', 'Malformed JSON body');
  // Postgres unique violation that slipped past service checks
  else if (err.code === '23505' || err.cause?.code === '23505') err = new AppError(409, 'CONFLICT', 'That value is already in use');

  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, path: req.path }, 'request failed');
    else logger.debug({ code: err.code, path: req.path }, 'client error');
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) } });
  }

  // Unknown error: log full detail server-side, return generic message to client.
  logger.error({ err, path: req.path, method: req.method, reqId: req.id }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' } });
}
