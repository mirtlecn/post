export const LIST_BATCH_SIZE = 10;
export const COPY_FEEDBACK_MS = 2000;
export const DELETE_CONFIRM_MS = 2000;
export const API_ROOT = '/api/admin';
export const SESSION_ROOT = `${API_ROOT}/session`;

export function sortItems(items) {
  return [...items].sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}
