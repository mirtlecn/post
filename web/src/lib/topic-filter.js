export const TOPIC_STORAGE_KEY = 'post:selected-topic';

function normalizeStoredTypeFilter(createType = 'none') {
  if (!createType || createType === 'none') return '';
  if (createType === 'md2html') return 'md';
  return createType;
}

function normalizePathSegment(value = '') {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

export function buildPathPrefixFilter({ selectedTopicPath = '', pathFilter = '' } = {}) {
  const topicPath = normalizePathSegment(selectedTopicPath);
  const path = normalizePathSegment(pathFilter);

  if (!topicPath) return path;
  if (!path) return '';
  return `${topicPath}/${path}`;
}

export function filterItemsByTopic(items, selectedTopicPath) {
  if (!selectedTopicPath) {
    return items;
  }

  const topicPrefix = `${selectedTopicPath}/`;
  const matchingItems = items.filter((item) => item.path === selectedTopicPath || item.path.startsWith(topicPrefix));
  const topicItem = matchingItems.find((item) => item.path === selectedTopicPath) || null;
  const topicChildren = matchingItems.filter((item) => item.path !== selectedTopicPath);

  return topicItem ? [topicItem, ...topicChildren] : topicChildren;
}

function filterItemsByPathPrefix(items, pathPrefix) {
  if (!pathPrefix) return items;
  return items.filter((item) => item.path.startsWith(pathPrefix));
}

function filterItemsByType(items, createType) {
  const storedType = normalizeStoredTypeFilter(createType);
  if (!storedType) return items;
  return items.filter((item) => item.type === storedType);
}

function filterItemsByTtl(items, ttlFilter) {
  if (ttlFilter === undefined || ttlFilter === null || ttlFilter === '') return items;
  const ttlLimit = Number.parseInt(String(ttlFilter), 10);
  if (!Number.isFinite(ttlLimit) || ttlLimit < 0) return items;
  return items.filter((item) => typeof item.ttl === 'number' && item.ttl <= ttlLimit);
}

export function filterDashboardItems(items, {
  selectedTopicPath = '',
  createType = 'none',
  pathFilter = '',
  ttlFilter = '',
} = {}) {
  let nextItems = filterItemsByTopic(items, selectedTopicPath);
  const pathPrefix = buildPathPrefixFilter({ selectedTopicPath, pathFilter });

  if (pathPrefix) {
    nextItems = filterItemsByPathPrefix(nextItems, pathPrefix);
  }

  nextItems = filterItemsByType(nextItems, createType);
  nextItems = filterItemsByTtl(nextItems, ttlFilter);

  return nextItems;
}
