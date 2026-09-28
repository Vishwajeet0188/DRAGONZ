// Typed application errors. The error handler turns these into a consistent JSON shape:
// { error: { code, message, details? } }
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

export const badRequest = (message = 'Invalid request', details) => new AppError(400, 'BAD_REQUEST', message, details);
export const validationError = (details) => new AppError(422, 'VALIDATION_ERROR', 'Some fields are invalid', details);
export const unauthorized = (message = 'Please sign in to continue') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to do that') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message = 'Already exists', details) => new AppError(409, 'CONFLICT', message, details);
export const tooMany = (message = 'Too many requests, please slow down') => new AppError(429, 'RATE_LIMITED', message);
