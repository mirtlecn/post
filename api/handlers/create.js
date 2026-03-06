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
 * 响应字段（统一规范）：
 *   surl        {string}       本机短链接
 *   path        {string}       路径
 *   type        {string}       url | text | html | file
 *   content     {string}       内容（url/file 完整，text/html 截断预览）
 *   expires_in  {number|null}  过期分钟数，null 表示永不过期
 *   overwritten {string}       [PUT 覆写时] 被覆写的旧 content
 *   warning     {string}       [可选] 警告信息
 *
 * POST 201  创建成功
 * POST 409  path 已存在
 * PUT  200  覆写成功 / 201 新建成功
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
import { isS3Configured, uploadFileToS3 } from '../utils/s3.js';
import formidable from 'formidable';
import { extname } from 'path';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10;

async function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024,
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        if (err.code === 1009 /* formidable FILE_SIZE_EXCEEDED */ || err.message?.includes('maxFileSize')) {
          return reject(Object.assign(new Error(`File too large (max ${parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10}MB)`), { status: 413 }));
        }
        return reject(err);
      }
      const unwrappedFields = Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
      );
      resolve({ fields: unwrappedFields, files });
    });
  });
}

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
  const contentTypeHeader = req.headers['content-type'] || '';
  const isFileUpload = contentTypeHeader.startsWith('multipart/form-data');

  if (isFileUpload) {
    if (!isS3Configured()) {
      return jsonResponse(res, { error: 'S3 service is not configured' }, 501);
    }
    return handleFileUpload(req, res, { allowOverwrite });
  } else {
    return handleJsonRequest(req, res, { allowOverwrite });
  }
}

async function handleFileUpload(req, res, { allowOverwrite }) {
  let fields, files;
  try {
    ({ fields, files } = await parseMultipartForm(req));
  } catch (error) {
    return jsonResponse(res, { error: error.message }, 413); // 413 Payload Too Large
  }

  const file = files.file ? (Array.isArray(files.file) ? files.file[0] : files.file) : null;
  if (!file) {
    return jsonResponse(res, { error: '`file` field is required for multipart/form-data' }, 400);
  }

  let { path, ttl } = fields;

  if (req.method === 'PUT' && !path) {
    return jsonResponse(res, { error: '`path` is required for PUT requests' }, 400);
  }

  // 文件扩展名（含点，如 ".jpg"；无扩展名时为空字符串）
  const fileExt = extname(file.originalFilename || '').toLowerCase();

  if (path) {
    const validation = validatePath(path);
    if (!validation.valid) {
      return jsonResponse(res, { error: validation.error }, 400);
    }
    // 用户指定了 path：若扩展名不一致则补上
    if (fileExt && extname(path).toLowerCase() !== fileExt) {
      path = path + fileExt;
    }
  } else {
    // 用户未指定 path：随机生成并附上扩展名
    path = randomPath() + fileExt;
  }

  try {
    // getObjectKeyPrefix 接收秒，ttl 字段单位为分钟，需转换
    const ttlSeconds = ttl ? parseInt(ttl, 10) * 60 : 0;
    const objectKey = await uploadFileToS3(file, ttlSeconds);
    const storedValue = buildStoredValue('file', objectKey);

    const redis = await getRedisClient();
    const key = LINKS_PREFIX + path;

    const existing = await redis.get(key);
    if (existing && !allowOverwrite) {
      return jsonResponse(res, { error: `path "${path}" already exists`, hint: 'Use PUT to overwrite' }, 409);
    }

    let expiresIn = null;
    if (ttl !== undefined && ttl !== null) {
      let ttlMinutes = parseInt(ttl);
      if (isNaN(ttlMinutes) || ttlMinutes < 1) ttlMinutes = 1;
      await redis.setEx(key, ttlMinutes * 60, storedValue);
      expiresIn = ttlMinutes;
    } else {
      await redis.set(key, storedValue);
    }

    const result = {
      surl: `${getDomain(req)}/${path}`,
      path,
      type: 'file',
      content: objectKey,
      expires_in: expiresIn,
    };

    const status = (!allowOverwrite || !existing) ? 201 : 200;
    return jsonResponse(res, result, status);

  } catch (error) {
    console.error('File upload error:', error);
    return jsonResponse(res, { error: 'Failed to upload file' }, 500);
  }
}

async function handleJsonRequest(req, res, { allowOverwrite }) {
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
        path,
        type: exType,
        content: previewContent(exType, exContent),
      },
    }, 409);
  }

  // 写入，按需设置 TTL
  let ttlWarning = null;
  let expiresIn = null;

  if (ttl !== undefined && ttl !== null) {
    let ttlMinutes = parseInt(ttl);
    if (isNaN(ttlMinutes) || ttlMinutes < 1) {
      ttlMinutes = 1;
      ttlWarning = 'invalid ttl, fallback to 1 minute';
    }
    await redis.setEx(key, ttlMinutes * 60, storedValue);
    expiresIn = ttlMinutes;
  } else {
    await redis.set(key, storedValue);
  }

  const domain = getDomain(req);
  const isOverwrite = !!existing;

  const result = {
    surl: `${domain}/${path}`,
    path,
    type: contentType,
    content: previewContent(contentType, inputContent),
    expires_in: expiresIn,
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