import { errorResponse } from '../lib/utils/response.js';
import { isAuthenticated } from '../lib/utils/auth.js';
import { handleCreate, handleReplace } from '../lib/handlers/create.js';
import { handleDelete } from '../lib/handlers/remove.js';
import { handleList } from '../lib/handlers/list.js';
import { handleAuthenticatedLookup } from '../lib/handlers/authenticated-lookup.js';
import { handlePublicGet } from '../lib/handlers/public-get.js';
import { getActionFromPath, handleAction } from '../lib/handlers/action-router.js';
import { createAdminApiHandler } from '../lib/server/admin-api-handler.js';
import { createAdminSessionHandler } from '../lib/server/admin-session-handler.js';

function unauthorized(res) {
  return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
}

function requireWriteAuthentication(req, res) {
  if (isAuthenticated(req)) {
    return true;
  }

  unauthorized(res);
  return false;
}

export function createApiHandler({
  authenticate = isAuthenticated,
  getRequestUrl = (req) => new URL(req.url, `http://${req.headers.host || 'localhost'}`),
  onCreate = handleCreate,
  onReplace = handleReplace,
  onDelete = handleDelete,
  onList = handleList,
  onLookup = handleAuthenticatedLookup,
  onPublicGet = handlePublicGet,
  onAdmin = createAdminApiHandler(),
  onAdminSession = createAdminSessionHandler(),
} = {}) {
  return async function handler(req, res) {
    try {
      const requestUrl = getRequestUrl(req);
      const adminAction = requestUrl.searchParams.get('admin');

      if (adminAction === 'session') {
        return onAdminSession(req, res);
      }

      if (adminAction !== null) {
        return onAdmin(req, res);
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        return onPublicGet(req, res);
      }

      const action = getActionFromPath(requestUrl.pathname);
      if (req.method === 'POST' && action) {
        if (!authenticate(req)) {
          return unauthorized(res);
        }

        return handleAction(action, req, res, { onCreate, onReplace, onDelete, onList, onLookup });
      }

      return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    } catch (error) {
      console.error('Error:', error);
      return errorResponse(res, { code: 'internal', message: 'Internal server error' }, 500);
    }
  };
}

export default createApiHandler();
