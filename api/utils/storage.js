/**
 * Redis 存储格式工具函数
 *
 * 存储格式：`<type>:<content>`
 *   - url:https://example.com
 *   - text:hello world
 *   - html:<h1>hi</h1>
 *
 * 支持的类型：'url' | 'text' | 'html'
 */

/** Redis key 前缀，所有短链接均以此开头 */
export const LINKS_PREFIX = 'surl:';

/** 内容预览截断长度（字符数） */
export const PREVIEW_LENGTH = 15;

/**
 * 将类型和内容序列化为 Redis 存储值。
 * @param {'url'|'text'|'html'} type
 * @param {string} content
 * @returns {string}
 */
export function buildStoredValue(type, content) {
  return `${type}:${content}`;
}

/**
 * 将 Redis 存储值反序列化为 { type, content }。
 * @param {string} stored
 * @returns {{ type: 'url'|'text'|'html', content: string }}
 */
export function parseStoredValue(stored) {
  if (stored.startsWith('url:'))  return { type: 'url',  content: stored.slice(4) };
  if (stored.startsWith('html:')) return { type: 'html', content: stored.slice(5) };
  // 兜底：无前缀或 'text:' 前缀均视为纯文本
  return { type: 'text', content: stored.startsWith('text:') ? stored.slice(5) : stored };
}

/**
 * 返回内容的预览字符串。
 * URL 类型不截断；文本/HTML 超过 PREVIEW_LENGTH 时追加省略号。
 * @param {'url'|'text'|'html'} type
 * @param {string} content
 * @returns {string}
 */
export function previewContent(type, content) {
  if (type === 'url') return content;
  return content.length > PREVIEW_LENGTH
    ? content.substring(0, PREVIEW_LENGTH) + '...'
    : content;
}

/**
 * 从请求头中提取当前域名（协议 + 主机）。
 * 优先读取反向代理注入的 x-forwarded-* 头。
 * @returns {string} 例如 "https://example.com"
 */
export function getDomain(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  return `${protocol}://${host}`;
}

/**
 * 从请求体（JSON）中解析数据。
 * @returns {Promise<object>}
 */
export function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}
