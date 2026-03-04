/**
 * POST /  —  创建短链接或 pastebin 条目
 *
 * 请求体（JSON）：
 *   url      {string}  必填，目标 URL 或文本内容
 *   path     {string}  可选，自定义路径；省略时随机生成 5 位
 *   type     {string}  可选，'url' | 'text' | 'html'；省略时自动检测
 *   ttl      {number}  可选，过期时间（分钟）
 *
 * 响应（201）：
 *   surl, path, expires_in, url|text, [overwritten], [warning]
 */

import { getRedisClient } from '../redis.js';
import { jsonResponse } from '../utils/response.js';
import {
  LINKS_PREFIX,
  buildStoredValue,
  parseStoredValue,
  previewContent,
  getDomain,
  parseRequestBody,
} from '../utils/storage.js';

/** 随机生成 5 位 base-36 路径 */
function randomPath() {
  return [...Array(5)].map(() => (~~(Math.random() * 36)).toString(36)).join('');
}

export async function handleCreate(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return jsonResponse(res, { error: 'Invalid JSON body' }, 400);
  }

  const { url: inputContent, ttl, type: inputType } = body;
  let { path } = body;

  if (!inputContent) {
    return jsonResponse(res, { error: '`url` is required' }, 400);
  }

  if (inputType !== undefined && !['url', 'text', 'html'].includes(inputType)) {
    return jsonResponse(res, { error: '`type` must be one of: url, text, html' }, 400);
  }

  // 内容大小限制
  const maxBytes = (parseInt(process.env.MAX_CONTENT_SIZE_KB, 10) || 500) * 1024;
  if (Buffer.byteLength(inputContent, 'utf8') > maxBytes) {
    return jsonResponse(res, { error: `Content too large (max ${maxBytes / 1024}KB)` }, 400);
  }

  // 自动检测类型：未指定时尝试解析为 URL，失败则视为 text
  let contentType = inputType;
  if (!contentType) {
    try { new URL(inputContent); contentType = 'url'; }
    catch { contentType = 'text'; }
  }

  if (!path) path = randomPath();

  const redis = await getRedisClient();
  const key = LINKS_PREFIX + path;
  const storedValue = buildStoredValue(contentType, inputContent);

  // 读取已有条目（用于返回 overwritten 字段）
  const existing = await redis.get(key);

  // 写入，按需设置 TTL
  let ttlWarning = null;
  let expiresIn = 'never';

  if (ttl !== undefined && ttl !== null) {
    let ttlMinutes = parseInt(ttl);
    if (isNaN(ttlMinutes) || ttlMinutes < 1) {
      ttlMinutes = 1;
      ttlWarning = 'invalid ttl, fallback to 1 minute';
    }
    await redis.setEx(key, ttlMinutes * 60, storedValue);
    expiresIn = `${ttlMinutes} minute(s)`;
  } else {
    await redis.set(key, storedValue);
  }

  const domain = getDomain(req);
  const result = {
    surl: `${domain}/${path}`,
    path,
    expires_in: expiresIn,
    ...(contentType === 'url'
      ? { url: inputContent }
      : { text: previewContent(contentType, inputContent) }),
  };

  if (existing) {
    const { type: exType, content: exContent } = parseStoredValue(existing);
    result.overwritten = previewContent(exType, exContent);
  }
  if (ttlWarning) result.warning = ttlWarning;

  return jsonResponse(res, result, 201);
}
