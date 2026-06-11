import {
  LINKS_PREFIX,
  buildStoredValue,
  parseStoredValue,
  resolveStoredCreated,
} from '../utils/storage.js';
import {
  countTopicItems,
  ensureTopicItemsKey,
  getTopicItemsKey,
  readStoredTopic,
  TOPIC_TYPE,
} from './topic-common.js';
import { adoptTopicItems, rebuildTopicIndex } from './topic-index.js';

function normalizeTtlSeconds(ttlSeconds) {
  return typeof ttlSeconds === 'number' && ttlSeconds > 0 ? ttlSeconds : null;
}

async function setStoredValue(redis, key, storedValue, ttlSeconds) {
  if (ttlSeconds && ttlSeconds > 0) {
    await redis.setEx(key, ttlSeconds, storedValue);
    return;
  }

  await redis.set(key, storedValue);
}

async function restoreStoredValue(redis, key, storedValue, ttlSeconds) {
  if (!storedValue) {
    await redis.del(key);
    return;
  }

  await setStoredValue(redis, key, storedValue, normalizeTtlSeconds(ttlSeconds));
}

async function syncTopicIndex(
  redis,
  topicName,
  {
    title,
    titleProvided = false,
    created,
    createdProvided = false,
    requestReceivedAt,
    adoptExistingItems = false,
  } = {},
) {
  if (adoptExistingItems) {
    await adoptTopicItems(redis, topicName);
  }

  await rebuildTopicIndex(redis, topicName, {
    title,
    titleProvided,
    created,
    createdProvided,
    requestReceivedAt,
  });
}

function getParentTopicEntry(topicName) {
  const slashIndex = topicName.lastIndexOf('/');
  if (slashIndex <= 0 || slashIndex === topicName.length - 1) {
    return null;
  }

  return {
    topicName: topicName.slice(0, slashIndex),
    member: topicName.slice(slashIndex + 1),
  };
}

async function syncParentTopicEntry(redis, topicName) {
  const parentTopic = getParentTopicEntry(topicName);
  if (!parentTopic) {
    return;
  }

  const storedParentTopic = await readStoredTopic(redis, parentTopic.topicName);
  if (storedParentTopic?.type !== TOPIC_TYPE) {
    return;
  }

  const storedChildTopic = await readStoredTopic(redis, topicName);
  if (storedChildTopic?.type !== TOPIC_TYPE) {
    return;
  }

  const resolvedCreated = resolveStoredCreated(storedChildTopic.created);
  await redis.zAdd(getTopicItemsKey(parentTopic.topicName), {
    score: resolvedCreated.sortTimestamp ?? Math.floor(Date.now() / 1000),
    value: parentTopic.member,
  });
  await rebuildTopicIndex(redis, parentTopic.topicName);
}

async function removeParentTopicEntry(redis, topicName) {
  const parentTopic = getParentTopicEntry(topicName);
  if (!parentTopic) {
    return;
  }

  const storedParentTopic = await readStoredTopic(redis, parentTopic.topicName);
  if (storedParentTopic?.type !== TOPIC_TYPE) {
    return;
  }

  await redis.zRem(getTopicItemsKey(parentTopic.topicName), parentTopic.member);
  await rebuildTopicIndex(redis, parentTopic.topicName);
}

export async function createTopic(
  redis,
  topicName,
  { title = '', titleProvided = false, created, createdProvided = false, requestReceivedAt } = {},
) {
  await ensureTopicItemsKey(redis, topicName);
  await syncTopicIndex(redis, topicName, {
    title,
    titleProvided,
    created,
    createdProvided,
    requestReceivedAt,
    adoptExistingItems: true,
  });
  await syncParentTopicEntry(redis, topicName);
}

export async function refreshTopic(
  redis,
  topicName,
  { title = '', titleProvided = false, created, createdProvided = false, requestReceivedAt } = {},
) {
  await ensureTopicItemsKey(redis, topicName);
  await syncTopicIndex(redis, topicName, {
    title,
    titleProvided,
    created,
    createdProvided,
    requestReceivedAt,
    adoptExistingItems: true,
  });
  await syncParentTopicEntry(redis, topicName);
}

export async function deleteTopic(redis, topicName) {
  const topicKey = `${LINKS_PREFIX}${topicName}`;
  const storedValue = await redis.get(topicKey);
  if (!storedValue) {
    return null;
  }

  const parsedValue = parseStoredValue(storedValue);
  if (parsedValue.type !== TOPIC_TYPE) {
    return null;
  }

  const count = await countTopicItems(redis, topicName);
  await redis.del([topicKey, getTopicItemsKey(topicName)]);
  await removeParentTopicEntry(redis, topicName);
  return {
    type: TOPIC_TYPE,
    title: parsedValue.title,
    created: parsedValue.created,
    content: String(count),
  };
}

export async function writeTopicItem({
  redis,
  topicName,
  relativePath,
  fullPath,
  storedValue,
  allowOverwrite,
  ttlSeconds,
  existingStoredValue,
  clearPathCache,
}) {
  const itemKey = `${LINKS_PREFIX}${fullPath}`;
  const currentStoredValue = existingStoredValue ?? await redis.get(itemKey);

  if (currentStoredValue && !allowOverwrite) {
    return {
      didOverwrite: false,
      existingStoredValue: currentStoredValue,
      existingTtlSeconds: normalizeTtlSeconds(await redis.ttl(itemKey)),
    };
  }

  const existingTtlSeconds = currentStoredValue
    ? normalizeTtlSeconds(await redis.ttl(itemKey))
    : null;

  if (currentStoredValue && allowOverwrite) {
    await clearPathCache(fullPath);
  }

  await setStoredValue(redis, itemKey, storedValue, ttlSeconds);

  try {
    await redis.zAdd(getTopicItemsKey(topicName), {
      score: Math.floor(Date.now() / 1000),
      value: relativePath,
    });
  } catch (error) {
    await restoreStoredValue(redis, itemKey, currentStoredValue, existingTtlSeconds);
    throw error;
  }

  try {
    await syncTopicIndex(redis, topicName);
  } catch (error) {
    await redis.zRem(getTopicItemsKey(topicName), relativePath);
    await restoreStoredValue(redis, itemKey, currentStoredValue, existingTtlSeconds);
    throw error;
  }

  return {
    didOverwrite: Boolean(currentStoredValue),
    existingStoredValue: currentStoredValue,
    existingTtlSeconds,
  };
}

export async function deleteTopicItem({
  redis,
  topicName,
  relativePath,
  fullPath,
  clearPathCache,
}) {
  const itemKey = `${LINKS_PREFIX}${fullPath}`;
  const existingStoredValue = await redis.get(itemKey);
  if (!existingStoredValue) {
    return null;
  }

  const existingTtlSeconds = normalizeTtlSeconds(await redis.ttl(itemKey));
  const parsedValue = parseStoredValue(existingStoredValue);

  await redis.del(itemKey);
  await clearPathCache(fullPath);

  try {
    await redis.zRem(getTopicItemsKey(topicName), relativePath);
  } catch (error) {
    await restoreStoredValue(redis, itemKey, existingStoredValue, existingTtlSeconds);
    throw error;
  }

  try {
    await syncTopicIndex(redis, topicName);
  } catch (error) {
    await redis.zAdd(getTopicItemsKey(topicName), {
      score: Math.floor(Date.now() / 1000),
      value: relativePath,
    });
    await restoreStoredValue(redis, itemKey, existingStoredValue, existingTtlSeconds);
    throw error;
  }

  return parsedValue;
}
