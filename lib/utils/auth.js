import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 认证工具函数
 * Bearer token 继续给 CLI / API 用；管理端改用 HttpOnly Cookie 会话。
 */

export const ADMIN_SESSION_COOKIE = 'post_admin_session';
export const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60;
export const ADMIN_SESSION_PATH = '/api/admin';

function isSecureCookie() {
  return process.env.NODE_ENV === 'production';
}

/**
 * 从 Authorization 头提取 Bearer token。
 * @returns {string|null} token 字符串，或 null（头不存在 / 格式不符）
 */
export function getToken(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

/**
 * 获取前端 GUI 认证密钥：优先 ADMIN_KEY，其次 SECRET_KEY。
 * @returns {string|undefined}
 */
export function getAdminKey() {
  return process.env.ADMIN_KEY || process.env.SECRET_KEY;
}

function getAdminSessionToken() {
  const adminKey = getAdminKey();
  const secretKey = process.env.SECRET_KEY;
  if (!adminKey || !secretKey) return '';
  // 会话值由服务端密钥派生，不把真实口令直接放进 Cookie。
  return createHmac('sha256', `${secretKey}:${adminKey}`)
    .update('post-admin-session:v1')
    .digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key !== name) continue;
    return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function buildSetCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildAdminSessionCookie() {
  return buildSetCookie(ADMIN_SESSION_COOKIE, getAdminSessionToken(), {
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: ADMIN_SESSION_PATH,
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureCookie(),
  });
}

export function buildAdminLogoutCookie() {
  return buildSetCookie(ADMIN_SESSION_COOKIE, '', {
    maxAge: 0,
    path: ADMIN_SESSION_PATH,
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureCookie(),
  });
}

export function isAdminSessionAuthenticated(req) {
  const token = getCookie(req, ADMIN_SESSION_COOKIE);
  const expected = getAdminSessionToken();
  if (!token || !expected) return false;
  return safeEqual(token, expected);
}

/**
 * API 认证：始终使用 SECRET_KEY。
 * @returns {boolean}
 */
export function isAuthenticated(req) {
  return getToken(req) === process.env.SECRET_KEY;
}

/**
 * GUI 认证：优先 ADMIN_KEY，无 ADMIN_KEY 时回退 SECRET_KEY。
 * @returns {boolean}
 */
export function isAdminAuthenticated(req) {
  const adminKey = getAdminKey();
  if (!adminKey) return false;
  return getToken(req) === adminKey;
}

export function isAdminRequestAuthenticated(req) {
  return isAdminSessionAuthenticated(req) || isAdminAuthenticated(req);
}
