/**
 * POST /  —  创建条目（path 已存在时返回 409）
 * PUT  /  —  创建或覆写条目（幂等）
 *
 * 请求体（JSON）：
 *   url      {string}  必填，目标 URL 或文本内容
 *   path     {string}  可选，自定义路径；省略时随机生成 5 位（PUT 时必填）
 *   type     {string}  可选，'url' | 'text' | 'html'；省略时自动检测
 *   ttl      {number}  可选，过期时间（分钟）
 *   convert  {string}  可选，'md2html' | 'qrcode' | 'html' | 'url' | 'text'
 *
 * 响应：
 *   POST 201  创建成功
 *   POST 409  path 已存在
 *   PUT  200  覆写成功 / 201 新建成功
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
import { convertMarkdownToHtml, convertToQrCode } from '../utils/converter.js';

/** 随机生成 5 位 base-36 路径 */
function randomPath() {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz'; // 去除易混淆字符
  return [...Array(5)].map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * 校验 path 是否合法
 * @param {string} path
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePath(path) {
  // 1. 长度限制：1-99 字符
  if (path.length < 1 || path.length > 99) {
    return { valid: false, error: 'path must be 1-99 characters' };
  }
  // 2. 字符限制：a-zA-Z0-9 以及 -_./()
  if (!/^[a-zA-Z0-9_.\-()/]+$/.test(path)) {
    return { valid: false, error: 'path can only contain: a-z A-Z 0-9 - _ . / ( )' };
  }
  return { valid: true };
}

/** POST：不允许覆写已有 path */
export async function handleCreate(req, res) {
  return write(req, res, { allowOverwrite: false });
}

/** PUT：允许覆写已有 path */
export async function handleReplace(req, res) {
  return write(req, res, { allowOverwrite: true });
}

/**
 * 公共写入逻辑
 * @param {{ allowOverwrite: boolean }} opts
 */
async function write(req, res, { allowOverwrite }) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return jsonResponse(res, { error: 'Invalid JSON body' }, 400);
  }

  let { url: inputContent, ttl, type: inputType, convert } = body;
  let { path } = body;

  if (!inputContent) {
    return jsonResponse(res, { error: '`url` is required' }, 400);
  }
  // ── path 校验 ──────────────────────────────────────────────
  if (path) {
    const validation = validatePath(path);
    if (!validation.valid) {
      return jsonResponse(res, { error: validation.error }, 400);
    }
  } else {
    path = randomPath();
  }

  if (inputType !== undefined && !['url', 'text', 'html'].includes(inputType)) {
    return jsonResponse(res, { error: '`type` must be one of: url, text, html' }, 400);
  }

  // ── 转换处理 ──────────────────────────────────────────────
  if (convert) {
    switch (convert) {
      case 'md2html':
        try {
          inputContent = convertMarkdownToHtml(inputContent);
          inputType = 'html';  // 自动设置类型为 html
        } catch (error) {
          return jsonResponse(res, { error: error.message }, 400);
        }
        break;

      case 'qrcode':
        try {
          inputContent = await convertToQrCode(inputContent);
          // QR 码结果是纯文本，保持原 type 或默认为 text
        } catch (error) {
          return jsonResponse(res, { error: error.message }, 400);
        }
        break;

      case 'html':
      case 'url':
      case 'text':
        // 仅设置类型，不做转换
        inputType = convert;
        break;

      default:
        return jsonResponse(res, {
          error: `Invalid convert value: ${convert}. Must be one of: md2html, qrcode, html, url, text`
        }, 400);
    }
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

  const redis = await getRedisClient();
  const key = LINKS_PREFIX + path;
  const storedValue = buildStoredValue(contentType, inputContent);

  // 检查 path 是否已存在
  const existing = await redis.get(key);

  if (existing && !allowOverwrite) {
    // POST 不允许覆写：返回 409 Conflict
    const { type: exType, content: exContent } = parseStoredValue(existing);
    return jsonResponse(res, {
      error: `path "${path}" already exists`,
      hint: 'Use PUT to overwrite',
      existing: {
        surl: `${getDomain(req)}/${path}`,
        type: exType,
        content: previewContent(exType, exContent),
      },
    }, 409);
  }

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
  const isOverwrite = !!existing;  // PUT 覆写时为 true

  const result = {
    surl: `${domain}/${path}`,
    path,
    expires_in: expiresIn,
    ...(contentType === 'url'
      ? { url: inputContent }
      : { text: previewContent(contentType, inputContent) }),
  };

  if (isOverwrite) {
    const { type: exType, content: exContent } = parseStoredValue(existing);
    result.overwritten = previewContent(exType, exContent);
  }
  if (ttlWarning) result.warning = ttlWarning;

  // POST 新建 → 201，PUT 覆写 → 200，PUT 新建 → 201
  const status = (!allowOverwrite || !isOverwrite) ? 201 : 200;
  return jsonResponse(res, result, status);
}
