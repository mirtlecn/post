/**
 * Admin API entry for the /admin frontend.
 *
 * Authentication rules:
 * - Entry authentication uses ADMIN_KEY and falls back to SECRET_KEY.
 * - Downstream action calls always use SECRET_KEY.
 */

import { errorResponse } from '../lib/utils/response.js';
import { isAdminRequestAuthenticated } from '../lib/utils/auth.js';
import { ADMIN_ACTIONS, createActionApiHandler } from '../lib/handlers/action-router.js';
import {
  handleCompleteUpload,
  handlePrepareUpload,
} from '../lib/services/create/direct-upload.js';

const handleAdminAction = createActionApiHandler({
  basePath: '/api/admin',
  actions: ADMIN_ACTIONS,
  onPrepareUpload: handlePrepareUpload,
  onCompleteUpload: handleCompleteUpload,
});

function withSecretAuthorization(req) {
  const headers = { ...req.headers, authorization: `Bearer ${process.env.SECRET_KEY}` };
  const wrapped = Object.create(req);
  wrapped.headers = headers;
  return wrapped;
}

export function createAdminApiHandler({
  authenticate = isAdminRequestAuthenticated,
  apiHandler = handleAdminAction,
} = {}) {
  return async function handler(req, res) {
    if (!await authenticate(req)) {
      return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
    }
    return apiHandler(withSecretAuthorization(req), res);
  };
}

export default createAdminApiHandler();
