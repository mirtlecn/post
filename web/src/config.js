export const TOKEN_KEY = 'post_admin_token';
export const PAGE_SIZE = 8;
export const API_ROOT = import.meta.env.DEV ? '/__post_admin_api__' : '/api/admin';

export function sortItems(items) {
  return [...items].sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}
