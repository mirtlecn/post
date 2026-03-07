/**
 * 认证工具函数
 * 从请求头中提取 Bearer token，并与环境变量 SECRET_KEY 比对。
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
 * 判断请求是否已通过认证（token === SECRET_KEY）。
 * @returns {boolean}
 */
export function isAuthenticated(req) {
  return getToken(req) === process.env.SECRET_KEY;
}
