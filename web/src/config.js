export const LIST_BATCH_SIZE = 10;
export const COPY_FEEDBACK_MS = 2000;
export const DELETE_CONFIRM_MS = 2000;
export const API_ROOT = '/api';
export const SESSION_ROOT = `${API_ROOT}?admin=session`;

function getCreatedTime(item) {
  const time = Date.parse(item?.created || '');
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

export function sortItems(items) {
  return [...items].sort((a, b) => {
    const createdDiff = getCreatedTime(b) - getCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;
    return a.path.localeCompare(b.path, 'zh-CN');
  });
}
