/**
 * 认证工具函数
 * 从请求头中提取 Bearer token，并与环境变量密钥比对。
 */

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
