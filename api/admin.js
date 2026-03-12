/**
 * GUI 管理接口（仅供 /admin 前端使用）
 *
 * 认证规则：
 * - 入口认证：ADMIN_KEY（未设置时回退 SECRET_KEY）
 * - 下游 API：始终使用 SECRET_KEY
 */

import handleApiRoot from './index.js';
import { errorResponse } from '../lib/utils/response.js';
import { isAdminAuthenticated } from '../lib/utils/auth.js';

function withSecretAuthorization(req) {
  const headers = { ...req.headers, authorization: `Bearer ${process.env.SECRET_KEY}` };
  const wrapped = Object.create(req);
  wrapped.headers = headers;
  return wrapped;
}

export default async function handler(req, res) {
  if (!isAdminAuthenticated(req)) {
    return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  return handleApiRoot(withSecretAuthorization(req), res);
}
