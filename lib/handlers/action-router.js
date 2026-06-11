import { errorResponse } from '../utils/response.js';
import { handleCreate, handleReplace } from './create.js';
import { handleDelete } from './remove.js';
import { handleList } from './list.js';
import { handleAuthenticatedLookup } from './authenticated-lookup.js';

export const ACTIONS = new Set(['query', 'create', 'update', 'delete']);
export const ADMIN_ACTIONS = new Set([...ACTIONS, 'upload/prepare', 'upload/complete']);

function unauthorized(res) {
  return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
}

export function getActionFromPath(pathname, { basePath = '', actions = ACTIONS } = {}) {
  const normalizedBasePath = basePath.replace(/\/+$/, '');
  if (normalizedBasePath) {
    const prefix = `${normalizedBasePath}/`;
    if (!pathname.startsWith(prefix)) {
      return null;
    }

    const action = pathname.slice(prefix.length);
    return actions.has(action) ? action : null;
  }

  const action = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  return actions.has(action) ? action : null;
}

export async function handleAction(action, req, res, {
  onCreate = handleCreate,
  onReplace = handleReplace,
  onDelete = handleDelete,
  onList = handleList,
  onLookup = handleAuthenticatedLookup,
  onPrepareUpload,
  onCompleteUpload,
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
    case 'upload/prepare':
      return onPrepareUpload
        ? onPrepareUpload(req, res)
        : errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    case 'upload/complete':
      return onCompleteUpload
        ? onCompleteUpload(req, res)
        : errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    default:
      return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
  }
}

export function createActionApiHandler({
  authenticate,
  basePath = '',
  actions = ACTIONS,
  getPathname = (req) => new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname,
  onCreate = handleCreate,
  onReplace = handleReplace,
  onDelete = handleDelete,
  onList = handleList,
  onLookup = handleAuthenticatedLookup,
  onPrepareUpload,
  onCompleteUpload,
} = {}) {
  return async function actionApiHandler(req, res) {
    const action = getActionFromPath(getPathname(req), { basePath, actions });
    if (req.method !== 'POST' || !action) {
      return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    }

    if (authenticate && !await authenticate(req)) {
      return unauthorized(res);
    }

    return handleAction(action, req, res, {
      onCreate,
      onReplace,
      onDelete,
      onList,
      onLookup,
      onPrepareUpload,
      onCompleteUpload,
    });
  };
}
