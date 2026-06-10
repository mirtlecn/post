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
  const storedValues = await readStoredValues(
    redis,
    validMembers.map(({ member }) => `${LINKS_PREFIX}${topicName}/${member}`),
  );

  for (let index = 0; index < validMembers.length; index += 1) {
    const { item, member } = validMembers[index];
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

    const storedValues = await readStoredValues(redis, result.keys);
    const entriesToAdd = [];
    for (let index = 0; index < result.keys.length; index += 1) {
      const key = result.keys[index];
      const fullPath = key.slice(LINKS_PREFIX.length);
      const relativePath = fullPath.slice(topicName.length + 1);
      if (!relativePath) {
        continue;
      }

      const storedValue = storedValues[index];
      if (!storedValue) {
        continue;
      }

      const parsedValue = parseStoredValue(storedValue);
      if (parsedValue.type === TOPIC_TYPE) {
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
