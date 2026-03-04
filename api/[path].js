/**
 * GET /:path
 *
 * 已认证：返回该条目的 JSON 信息（供管理用）
 * 未认证：按类型响应——URL 重定向、HTML 渲染、纯文本输出
 */

import { getRedisClient } from './redis.js';
import { jsonResponse, textResponse, htmlResponse } from './utils/response.js';
import { isAuthenticated } from './utils/auth.js';
import { LINKS_PREFIX, parseStoredValue, previewContent, getDomain } from './utils/storage.js';

export default async function handler(req, res) {
  try {
    const { path } = req.query;

    if (!path) return jsonResponse(res, { error: 'URL not found' }, 404);

    const redis = await getRedisClient();
    const stored = await redis.get(LINKS_PREFIX + path);

    if (!stored) return jsonResponse(res, { error: 'URL not found' }, 404);

    const { type, content } = parseStoredValue(stored);

    // 已认证：返回条目详情，不执行重定向/渲染
    if (isAuthenticated(req)) {
      return jsonResponse(res, {
        surl: `${getDomain(req)}/${path}`,
        path,
        type,
        content: previewContent(type, content),
      });
    }

    // 未认证：按类型响应
    if (type === 'url') {
      res.writeHead(302, { Location: content });
      res.end();
    } else if (type === 'html') {
      htmlResponse(res, content);
    } else {
      textResponse(res, content);
    }
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse(res, { error: 'Internal server error' }, 500);
  }
}
