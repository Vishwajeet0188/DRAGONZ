import { validationError } from '../lib/errors.js';

/**
 * Validate and coerce request parts with zod schemas. Parsed values replace the originals,
 * so unknown keys are stripped (mass-assignment protection).
 * usage: validate({ body: schema, query: schema, params: schema })
 */
export const validate = (schemas) => (req, _res, next) => {
  const details = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      for (const i of result.error.issues) details.push({ field: i.path.join('.') || part, message: i.message });
    } else if (part === 'query') {
      // Express 5 makes req.query a getter; store parsed query separately.
      req.validatedQuery = result.data;
    } else {
      req[part] = result.data;
    }
  }
  if (details.length) return next(validationError(details));
  next();
};
