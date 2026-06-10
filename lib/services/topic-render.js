const TOPIC_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const TOPIC_GROUPING_ITEM_THRESHOLD = 10;

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
    case 'qrcode':
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

function formatTopicItemDateParts(updatedAt) {
  const parts = Object.fromEntries(
    TOPIC_DATE_FORMATTER
      .formatToParts(new Date(updatedAt * 1000))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: parts.year,
    fullDate: `${parts.year}-${parts.month}-${parts.day}`,
    shortDate: `${parts.month}-${parts.day}`,
  };
}

function shouldGroupTopicItems(sortedItems) {
  if (sortedItems.length <= TOPIC_GROUPING_ITEM_THRESHOLD) {
    return false;
  }

  const displayYears = new Set(sortedItems.map((item) => formatTopicItemDateParts(item.updatedAt).year));
  return displayYears.size > 1;
}

function buildFlatTopicLines(topicName, sortedItems) {
  return sortedItems.map((item) => {
    const { fullDate } = formatTopicItemDateParts(item.updatedAt);
    return formatTopicItemLine(topicName, item, fullDate);
  });
}

function buildGroupedTopicLines(topicName, sortedItems) {
  const lines = [];
  let currentYear = '';

  for (const item of sortedItems) {
    const { year, shortDate } = formatTopicItemDateParts(item.updatedAt);
    if (year !== currentYear) {
      if (currentYear) {
        lines.push('');
      }
      lines.push(`## ${year}`);
      lines.push('');
      currentYear = year;
    }

    lines.push(formatTopicItemLine(topicName, item, shortDate));
  }

  return lines;
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
    lines.push(
      ...(shouldGroupTopicItems(sortedItems)
        ? buildGroupedTopicLines(topicName, sortedItems)
        : buildFlatTopicLines(topicName, sortedItems)),
    );
  }

  return lines.join('\n');
}
