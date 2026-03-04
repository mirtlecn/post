/**
 * DELETE /  —  删除指定路径的条目
 *
 * 请求体（JSON）：
 *   path  {string}  必填，要删除的路径
 *
 * 响应（200）：
 *   deleted, url|text
 */

import { getRedisClient } from '../redis.js';
import { jsonResponse } from '../utils/response.js';
import {
  LINKS_PREFIX,
  parseStoredValue,
  previewContent,
  parseRequestBody,
} from '../utils/storage.js';

export async function handleDelete(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return jsonResponse(res, { error: 'Invalid JSON body' }, 400);
  }

  const { path } = body;
  if (!path) {
    return jsonResponse(res, { error: '`path` is required' }, 400);
  }

  const redis = await getRedisClient();
  const key = LINKS_PREFIX + path;

  const existing = await redis.get(key);
  if (!existing) {
    return jsonResponse(res, { error: `path "${path}" not found` }, 404);
  }

  await redis.del(key);

  const { type, content } = parseStoredValue(existing);
  const result = {
    deleted: path,
    ...(type === 'url'
      ? { url: content }
      : { text: previewContent(type, content) }),
  };

  return jsonResponse(res, result, 200);
}
