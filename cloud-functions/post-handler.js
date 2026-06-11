import { createFetchNodeAdapters } from '../lib/server/fetch-node-adapter.js';

const EDGEONE_ENV_KEYS = [
  'LINKS_REDIS_URL',
  'SECRET_KEY',
  'ADMIN_KEY',
  'MAX_CONTENT_SIZE_KB',
  'MAX_FILE_SIZE_MB',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
  'S3_REGION',
  'S3_FORCE_PATH_STYLE',
  'BASE_DOMAIN',
];

let handlersPromise = null;

function getContextRequest(context) {
  const request = context?.request || context;
  if (!request || typeof request.url !== 'string') {
    throw new Error('EdgeOne request is missing');
  }
  return request;
}

export function syncEdgeOneEnvironment(env = {}) {
  for (const key of EDGEONE_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined && value !== null) {
      process.env[key] = String(value);
    }
  }
}

async function loadApiHandlers() {
  if (!handlersPromise) {
    handlersPromise = Promise.all([
      import('../api/index.js'),
    ]).then(([
      { default: handleRoot },
    ]) => ({
      handleRoot,
    }));
  }

  return handlersPromise;
}

function shouldDisableEdgeOneCache(response, pathname) {
  if (pathname === '/') {
    return true;
  }

  const contentType = response.headers.get('Content-Type') || '';
  return contentType.toLowerCase().includes('application/json');
}

function applyEdgeOneResponsePolicy(response, requestUrl) {
  if (shouldDisableEdgeOneCache(response, requestUrl.pathname)) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
}

export function createEdgeOneRequestHandler({
  loadHandlers = loadApiHandlers,
} = {}) {
  return async function handleEdgeOneRequest(context) {
    syncEdgeOneEnvironment(context?.env);

    const request = getContextRequest(context);
    const requestUrl = new URL(request.url, 'http://localhost');
    const handlers = await loadHandlers();
    const { req, res } = await createFetchNodeAdapters(request);

    await handlers.handleRoot(req, res);
    const response = await res.toFetchResponse({ method: req.method });
    return applyEdgeOneResponsePolicy(response, requestUrl);
  };
}

export const handleEdgeOneRequest = createEdgeOneRequestHandler();
