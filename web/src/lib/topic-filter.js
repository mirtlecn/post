export const TOPIC_STORAGE_KEY = 'post:selected-topic';

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

export function filterDashboardItems(items, { selectedTopicPath = '', createType = 'none' } = {}) {
  if (createType === 'topic') {
    return items.filter((item) => item.type === 'topic');
  }

  return filterItemsByTopic(items, selectedTopicPath);
}
