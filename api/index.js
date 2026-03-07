/**
 * POST / PUT / DELETE / GET /
 *
 * POST   创建条目（需认证，path 已存在时返回 409）
 * PUT    创建或覆写条目（需认证，幂等）
 * DELETE 删除条目（需认证）
 * GET    已认证：列出所有条目；未认证：查找 path='/' 并响应
 */

import { getRedisClient } from '../lib/redis.js';
import { jsonResponse, errorResponse } from '../lib/utils/response.js';
import { isAuthenticated } from '../lib/utils/auth.js';
import { LINKS_PREFIX, parseStoredValue } from '../lib/utils/storage.js';
import { handleCreate, handleReplace } from '../lib/handlers/create.js';
import { handleDelete } from '../lib/handlers/remove.js';
import { handleList } from '../lib/handlers/list.js';
import { respondByType } from '../lib/utils/serve.js';

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'POST':
        if (!isAuthenticated(req)) return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
        return await handleCreate(req, res);

      case 'PUT':
        if (!isAuthenticated(req)) return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
        return await handleReplace(req, res);

      case 'DELETE':
        if (!isAuthenticated(req)) return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
        return await handleDelete(req, res);

      case 'GET':
        if (isAuthenticated(req)) return await handleList(req, res);
        // 未认证：将 '/' 作为普通路径查找
        return await handleRootPath(req, res);

      default:
        return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    }
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(res, { code: 'internal', message: 'Internal server error' }, 500);
  }
}

/**
 * 未认证的 GET /：在 Redis 中查找 path='/' 并响应。
 * 行为与 [path].js 中的非认证逻辑一致。
 */
async function handleRootPath(req, res) {
  const redis = await getRedisClient();
  const stored = await redis.get(LINKS_PREFIX + '/');

  if (!stored) return errorResponse(res, { code: 'not_found', message: 'URL not found' }, 404);

  const { type, content } = parseStoredValue(stored);
  return await respondByType(req, res, { type, content, path: '/', redis });
}
