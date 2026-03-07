/**
 * DELETE /  —  删除指定路径的条目
 *
 * 请求体（JSON）：
 *   path  {string}  必填，要删除的路径
 *
 * 响应字段（统一规范）：
 *   deleted  {string}  被删除的路径
 *   type     {string}  url | text | html | file
 *   content  {string}  被删除的内容预览
 */

import { getRedisClient } from '../redis.js';
import { jsonResponse, errorResponse } from '../utils/response.js';
import {
  LINKS_PREFIX,
  parseStoredValue,
  previewContent,
  parseRequestBody,
} from '../utils/storage.js';
import { isS3Configured, deleteFileFromS3 } from '../utils/s3.js';
import { clearFileCache } from '../utils/file-cache.js';

export async function handleDelete(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
  }

  const { path } = body;
  if (!path) {
    return errorResponse(res, { code: 'invalid_request', message: '`path` is required' }, 400);
  }

  const redis = await getRedisClient();
  const key = LINKS_PREFIX + path;

  const existing = await redis.get(key);
  if (!existing) {
    return errorResponse(res, { code: 'not_found', message: `path "${path}" not found` }, 404);
  }

  const { type, content } = parseStoredValue(existing);

  await redis.del(key);
  try {
    await clearFileCache(redis, path);
  } catch (error) {
    console.warn('Failed to clear file cache:', error);
  }

  if (type === 'file') {
    if (isS3Configured()) {
      try {
        await deleteFileFromS3(content);
      } catch (error) {
        console.error(`Failed to delete ${content} from S3`, error);
        // 不阻断响应，Redis 已删除即视为成功
      }
    } else {
      console.warn('S3 not configured, skipping deletion of', content);
    }
  }

  const result = {
    deleted: path,
    type,
    content: previewContent(type, content),
  };

  return jsonResponse(res, result, 200);
}
