/**
 * GET /（已认证）—  列出所有短链接条目
 *
 * 请求头：
 *   x-export: true   可选，设置后文本/HTML 内容不截断（用于导出）
 *
 * 响应（200）：条目数组
 *   [{ surl, path, type, content }]
 */

import { getRedisClient } from '../redis.js';
import { jsonResponse } from '../utils/response.js';
import {
  LINKS_PREFIX,
  parseStoredValue,
  previewContent,
  getDomain,
} from '../utils/storage.js';

export async function handleList(req, res) {
  const redis = await getRedisClient();
  const domain = getDomain(req);
  const isExport = req.headers['x-export'] === 'true';

  // 使用 SCAN 遍历所有匹配 key，避免 KEYS 阻塞 Redis
  const keys = [];
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, { MATCH: LINKS_PREFIX + '*', COUNT: 100 });
    cursor = result.cursor;
    keys.push(...result.keys);
  } while (cursor !== '0');

  // 并行读取所有条目
  const links = await Promise.all(
    keys.map(async (key) => {
      const path = key.slice(LINKS_PREFIX.length);
      const stored = await redis.get(key);
      const { type, content } = parseStoredValue(stored);
      return {
        surl: `${domain}/${path}`,
        path,
        type,
        // 导出模式下不截断，普通列表截断非 URL 内容
        content: isExport ? content : previewContent(type, content),
      };
    })
  );

  return jsonResponse(res, links, 200);
}
