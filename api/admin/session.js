import { parseRequestBody } from '../../lib/utils/storage.js';
import { errorResponse, jsonResponse } from '../../lib/utils/response.js';
import {
  buildAdminLogoutCookie,
  buildAdminSessionCookie,
  getAdminKey,
  isAdminSessionAuthenticated,
} from '../../lib/utils/auth.js';

function ok(res, payload) {
  return jsonResponse(res, payload, 200);
}

function unauthorized(res) {
  return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
}

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET':
        if (!isAdminSessionAuthenticated(req)) return unauthorized(res);
        return ok(res, { authenticated: true });

      case 'POST':
        return await handleLogin(req, res);

      case 'DELETE':
        res.setHeader('Set-Cookie', buildAdminLogoutCookie());
        return ok(res, { ok: true });

      default:
        return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    }
  } catch (error) {
    console.error('Admin session error:', error);
    return errorResponse(res, { code: 'internal', message: 'Internal server error' }, 500);
  }
}

async function handleLogin(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
  }

  const adminKey = getAdminKey();
  const password = typeof body?.password === 'string' ? body.password.trim() : '';

  if (!adminKey || !password || password !== adminKey) {
    return unauthorized(res);
  }

  res.setHeader('Set-Cookie', buildAdminSessionCookie());
  return ok(res, { authenticated: true });
}
