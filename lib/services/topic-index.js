import {
  LINKS_PREFIX,
  buildCurrentCreatedValue,
  buildStoredValue,
  parseStoredValue,
  resolveStoredCreated,
} from '../utils/storage.js';
import { buildTopicIndexMarkdown } from './topic-render.js';
import {
  getTopicItemsKey,
  readStoredTopic,
  readStoredValues,
  resolveTopicDisplayTitle,
  TOPIC_PLACEHOLDER_MEMBER,
  TOPIC_TYPE,
} from './topic-common.js';

function resolveTopicStoredTitle(nextTitle, titleProvided, existingTitle) {
  if (titleProvided) {
    return nextTitle;
  }

  return existingTitle;
}

function resolveTopicStoredCreated(nextCreated, createdProvided, existingCreated, fallbackCreated) {
  if (createdProvided) {
    return nextCreated;
  }

  if (existingCreated !== undefined) {
    return existingCreated;
  }

  return fallbackCreated;
}

function getNestedDirectChildName(relativePath) {
  const slashIndex = relativePath.indexOf('/');
  return slashIndex >= 0 ? relativePath.slice(0, slashIndex) : '';
}

async function readDirectChildTopicNames(redis, topicName, relativePaths) {
  const childNames = [
    ...new Set(relativePaths.map(getNestedDirectChildName).filter(Boolean)),
  ];

  if (childNames.length === 0) {
    return new Set();
  }

  const storedValues = await readStoredValues(
    redis,
    childNames.map((childName) => `${LINKS_PREFIX}${topicName}/${childName}`),
  );
  const topicNames = new Set();
  for (let index = 0; index < childNames.length; index += 1) {
    const storedValue = storedValues[index];
    if (!storedValue) {
      continue;
    }

    const parsedValue = parseStoredValue(storedValue);
    if (parsedValue.type === TOPIC_TYPE) {
      topicNames.add(childNames[index]);
    }
  }

  return topicNames;
}

function isNestedUnderDirectChildTopic(relativePath, directChildTopicNames) {
  const childName = getNestedDirectChildName(relativePath);
  return childName ? directChildTopicNames.has(childName) : false;
}

export async function rebuildTopicIndex(
  redis,
  topicName,
  { title, titleProvided = false, created, createdProvided = false, requestReceivedAt } = {},
) {
  const topicMembers = await redis.zRangeWithScores(getTopicItemsKey(topicName), 0, -1, {
    REV: true,
  });
  const indexItems = [];
  const staleMembers = [];
  const storedTopic = await readStoredTopic(redis, topicName);
  const resolvedStoredTitle = resolveTopicStoredTitle(title, titleProvided, storedTopic?.title || '');
  const resolvedStoredCreated = resolveTopicStoredCreated(
    created,
    createdProvided,
    storedTopic?.created,
    buildCurrentCreatedValue(requestReceivedAt),
  );
  const topicDisplayTitle = resolveTopicDisplayTitle(topicName, {
    type: TOPIC_TYPE,
    title: resolvedStoredTitle,
  });

  const validMembers = topicMembers
    .map((item) => ({
      item,
      member: String(item.value ?? item.member ?? ''),
    }))
    .filter(({ member }) => member && member !== TOPIC_PLACEHOLDER_MEMBER);
  const directChildTopicNames = await readDirectChildTopicNames(
    redis,
    topicName,
    validMembers.map(({ member }) => member),
  );
  const indexableMembers = [];
  for (const validMember of validMembers) {
    if (isNestedUnderDirectChildTopic(validMember.member, directChildTopicNames)) {
      staleMembers.push(validMember.member);
      continue;
    }

    indexableMembers.push(validMember);
  }

  const storedValues = await readStoredValues(
    redis,
    indexableMembers.map(({ member }) => `${LINKS_PREFIX}${topicName}/${member}`),
  );

  for (let index = 0; index < indexableMembers.length; index += 1) {
    const { item, member } = indexableMembers[index];
    const storedValue = storedValues[index];
    if (!storedValue) {
      staleMembers.push(member);
      continue;
    }

    const parsedValue = parseStoredValue(storedValue);
    const resolvedCreated = resolveStoredCreated(parsedValue.created);
    indexItems.push({
      path: member,
      fullPath: `${topicName}/${member}`,
      type: parsedValue.type,
      title: parsedValue.title,
      updatedAt: resolvedCreated.sortTimestamp ?? Number(item.score ?? 0),
    });
  }

  indexItems.sort((leftItem, rightItem) => rightItem.updatedAt - leftItem.updatedAt);

  if (staleMembers.length > 0) {
    await redis.zRem(getTopicItemsKey(topicName), staleMembers);
  }

  const markdown = buildTopicIndexMarkdown(topicName, topicDisplayTitle, indexItems);
  await redis.set(
    `${LINKS_PREFIX}${topicName}`,
    buildStoredValue({
      type: TOPIC_TYPE,
      content: markdown,
      title: resolvedStoredTitle,
      created: resolvedStoredCreated,
    }),
  );
}

export async function adoptTopicItems(redis, topicName) {
  let cursor = '0';
  const updatedAt = Math.floor(Date.now() / 1000);
  const matchPattern = `${LINKS_PREFIX}${topicName}/*`;

  do {
    const result = await redis.scan(cursor, { MATCH: matchPattern, COUNT: 100 });
    cursor = result.cursor;

    const scannedItems = result.keys
      .map((key) => {
        const fullPath = key.slice(LINKS_PREFIX.length);
        const relativePath = fullPath.slice(topicName.length + 1);
        return { key, relativePath };
      })
      .filter(({ relativePath }) => relativePath);
    const directChildTopicNames = await readDirectChildTopicNames(
      redis,
      topicName,
      scannedItems.map(({ relativePath }) => relativePath),
    );
    const storedValues = await readStoredValues(
      redis,
      scannedItems.map(({ key }) => key),
    );
    const entriesToAdd = [];
    for (let index = 0; index < scannedItems.length; index += 1) {
      const { relativePath } = scannedItems[index];
      const storedValue = storedValues[index];
      if (!storedValue) {
        continue;
      }

      parseStoredValue(storedValue);
      if (isNestedUnderDirectChildTopic(relativePath, directChildTopicNames)) {
        continue;
      }

      entriesToAdd.push({
        score: updatedAt,
        value: relativePath,
      });
    }

    if (entriesToAdd.length > 0) {
      await redis.zAdd(getTopicItemsKey(topicName), entriesToAdd);
    }
  } while (cursor !== '0');
}
