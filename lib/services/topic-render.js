import { convertMarkdownToHtml } from '../utils/converter.js';

const TOPIC_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function compareTopicItems(leftItem, rightItem) {
  if (leftItem.updatedAt !== rightItem.updatedAt) {
    return rightItem.updatedAt - leftItem.updatedAt;
  }
  return leftItem.path.localeCompare(rightItem.path);
}

function typeMark(type) {
  switch (type) {
    case 'url':
      return '↗';
    case 'text':
      return '☰';
    case 'file':
      return '◫';
    default:
      return '';
  }
}

function displayTitle(topicName, item) {
  if (item.title) {
    return item.title;
  }

  const fullPath = item.fullPath || `${topicName}/${item.path}`;
  const topicPrefix = `${topicName}/`;
  if (fullPath.startsWith(topicPrefix)) {
    return fullPath.slice(topicPrefix.length);
  }

  return item.path || fullPath;
}

function buildTopicItemHref(topicName, item) {
  return `/${topicName}/${item.path}`;
}

function formatTopicItemLine(topicName, item, updatedAtLabel) {
  const itemTypeMark = typeMark(item.type);
  const lineSuffix = itemTypeMark
    ? ` ${itemTypeMark} · ${updatedAtLabel}`
    : ` · ${updatedAtLabel}`;
  return `- [${displayTitle(topicName, item)}](<${buildTopicItemHref(topicName, item)}>)${lineSuffix}`;
}

function buildTopicItemLine(topicName, item, updatedAtLabel) {
  return formatTopicItemLine(topicName, item, updatedAtLabel);
}

function formatTopicItemDate(updatedAt) {
  return TOPIC_DATE_FORMATTER.format(new Date(updatedAt * 1000));
}

export function buildTopicIndexMarkdown(topicName, topicTitle, items) {
  const lines = [
    `<div style="font-size: 1.3em; font-weight: bold">${topicTitle}</div>`,
    '\n\n',
    '<span style="color: #666;">Home</span>',
    '\n\n\n\n\n\n'
  ];
  const sortedItems = [...items].sort(compareTopicItems);

  if (sortedItems.length > 0) {
    for (const item of sortedItems) {
      const updatedAtLabel = formatTopicItemDate(item.updatedAt);
      lines.push(buildTopicItemLine(topicName, item, updatedAtLabel));
    }
  }

  return lines.join('\n');
}

export function renderTopicIndexHtml(topicName, topicTitle, items) {
  return convertMarkdownToHtml(buildTopicIndexMarkdown(topicName, topicTitle, items), {
    pageTitle: topicTitle,
  });
}
