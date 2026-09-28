import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';

/**
 * Record an admin/security-relevant action. Never pass secrets in metadata.
 * Failures are logged but never break the user-facing request.
 */
export async function audit(actorId, action, entityType, entityId = null, metadata = null, tx = db) {
  try {
    await tx.insert(schema.auditLogs).values({ actorId, action, entityType, entityId, metadata });
  } catch (err) {
    logger.error({ err, action, entityType }, 'failed to write audit log');
  }
}
