/**
 * POST /api/sharing/transfer
 * Transfer household ownership to an active member. Body: { newPrimaryUserId }.
 */
import { withAuth } from '@/lib/utils/require-auth';
import { apiBadRequest, apiSuccess } from '@/lib/api/response';
import { transferOwnership } from '@/lib/sharing-transfer';
import { logShareAudit, SHARE_AUDIT_ACTIONS } from '@/lib/share-audit';
import { logger } from '@/lib/logger';

export const POST = withAuth(async (req, { userId }) => {
  const body = await req.json().catch(() => null);
  const newPrimaryUserId = body?.newPrimaryUserId;

  if (typeof newPrimaryUserId !== 'string' || newPrimaryUserId.length === 0) {
    return apiBadRequest('newPrimaryUserId is required');
  }

  const result = await transferOwnership(userId, newPrimaryUserId);
  if (result && typeof result === 'object' && 'error' in result) {
    return apiBadRequest(result.error);
  }

  await logShareAudit(userId, userId, SHARE_AUDIT_ACTIONS.OWNERSHIP_TRANSFERRED, 'users', newPrimaryUserId);
  logger.info('[sharing] Ownership transferred via API', { oldPrimaryUserId: userId, newPrimaryUserId });

  return apiSuccess({ success: true });
});
