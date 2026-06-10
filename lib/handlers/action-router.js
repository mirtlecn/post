import { errorResponse } from '../utils/response.js';
import { handleCreate, handleReplace } from './create.js';
import { handleDelete } from './remove.js';
import { handleList } from './list.js';
import { handleAuthenticatedLookup } from './authenticated-lookup.js';

export const ACTIONS = new Set(['query', 'create', 'update', 'delete']);

function unauthorized(res) {
  return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
}

export function getActionFromPath(pathname, { basePath = '' } = {}) {
  const normalizedBasePath = basePath.replace(/\/+$/, '');
  if (normalizedBasePath) {
    const prefix = `${normalizedBasePath}/`;
    if (!pathname.startsWith(prefix)) {
      return null;
    }

    const action = pathname.slice(prefix.length);
    return ACTIONS.has(action) ? action : null;
  }

  const action = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  return ACTIONS.has(action) ? action : null;
}

export async function handleAction(action, req, res, {
  onCreate = handleCreate,
  onReplace = handleReplace,
  onDelete = handleDelete,
  onList = handleList,
  onLookup = handleAuthenticatedLookup,
} = {}) {
  switch (action) {
    case 'create':
      return onCreate(req, res);
    case 'update':
      return onReplace(req, res);
    case 'delete':
      return onDelete(req, res);
    case 'query':
      if (await onLookup(req, res)) {
        return;
      }
      return onList(req, res);
    default:
      return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
  }
}

export function createActionApiHandler({
  authenticate,
  basePath = '',
  getPathname = (req) => new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname,
  onCreate = handleCreate,
  onReplace = handleReplace,
  onDelete = handleDelete,
  onList = handleList,
  onLookup = handleAuthenticatedLookup,
} = {}) {
  return async function actionApiHandler(req, res) {
    const action = getActionFromPath(getPathname(req), { basePath });
    if (req.method !== 'POST' || !action) {
      return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    }

    if (authenticate && !await authenticate(req)) {
      return unauthorized(res);
    }

    return handleAction(action, req, res, { onCreate, onReplace, onDelete, onList, onLookup });
  };
}
