/**
 * Admin API entry for the /admin frontend.
 *
 * Authentication rules:
 * - Entry authentication uses ADMIN_KEY and falls back to SECRET_KEY.
 * - Downstream action calls always use SECRET_KEY.
 */

import { errorResponse } from '../utils/response.js';
import { isAdminRequestAuthenticated } from '../utils/auth.js';
import { ACTIONS, handleAction } from '../handlers/action-router.js';

function unauthorized(res) {
  return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
}

function getAdminAction(req) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const action = requestUrl.searchParams.get('admin');
  return ACTIONS.has(action) ? action : null;
}

function withSecretAuthorization(req) {
  const headers = { ...req.headers, authorization: `Bearer ${process.env.SECRET_KEY}` };
  const wrapped = Object.create(req);
  wrapped.headers = headers;
  return wrapped;
}

export function createAdminApiHandler({
  authenticate = isAdminRequestAuthenticated,
  getAction = getAdminAction,
  onAction = handleAction,
} = {}) {
  return async function handler(req, res) {
    const action = getAction(req);
    if (req.method !== 'POST' || !action) {
      return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    }

    if (!await authenticate(req)) {
      return unauthorized(res);
    }

    return onAction(action, withSecretAuthorization(req), res);
  };
}

export default createAdminApiHandler();
