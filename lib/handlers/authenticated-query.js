import {
  LINKS_PREFIX,
  parseStoredValue,
  getDomain,
  previewContent,
  resolveStoredCreated,
} from '../utils/storage.js';
import { buildPublicLink } from '../utils/link-path.js';
import {
  TOPIC_TYPE,
  countTopicItemsBatch,
  readStoredValues,
  readTtlValues,
  resolveTopicDisplayTitle,
} from '../services/topic-store.js';

const TOPIC_ITEMS_SCAN_PATTERN = 'topic:*:items';

function ttlMinutesFromSeconds(ttlSeconds) {
  return ttlSeconds > 0 ? Math.max(1, Math.ceil(ttlSeconds / 60)) : null;
}

export function parseTrailingWildcardPath(path) {
  if (typeof path !== 'string' || !path.includes('*')) {
    return {
      isWildcard: false,
      prefix: path,
    };
  }

  if (path === '*') {
    return {
      isWildcard: true,
      prefix: '',
    };
  }

  const starIndex = path.indexOf('*');
  const hasSingleTrailingWildcard = starIndex === path.length - 1 && starIndex === path.lastIndexOf('*');
  if (!hasSingleTrailingWildcard) {
    throw new Error('`path` wildcard only supports a single trailing "*"');
  }

  return {
    isWildcard: true,
    prefix: path.slice(0, -1),
  };
}

async function scanKeys(redis, matchPattern) {
  const keys = [];
  let cursor = '0';

  do {
    const result = await redis.scan(cursor, { MATCH: matchPattern, COUNT: 100 });
    cursor = result.cursor;
    keys.push(...result.keys);
  } while (cursor !== '0');

  return keys;
}

export async function scanStoredPaths(redis) {
  const keys = await scanKeys(redis, `${LINKS_PREFIX}*`);
  return keys
    .map((key) => key.slice(LINKS_PREFIX.length))
    .sort();
}

export async function scanTopicPaths(redis) {
  const keys = await scanKeys(redis, TOPIC_ITEMS_SCAN_PATTERN);
  return keys
    .map((key) => key.slice('topic:'.length, -':items'.length))
    .filter(Boolean)
    .sort();
}

function buildItemResponse(req, { path, type, title, content, ttl, created }, isExport) {
  return {
    surl: buildPublicLink(getDomain(req), path),
    path,
    type,
    title,
    created: resolveStoredCreated(created).created,
    ttl,
    content: isExport ? content : previewContent(type, content),
  };
}

function buildTopicResponse(req, { path, title, created, count }) {
  return {
    surl: buildPublicLink(getDomain(req), path),
    path,
    type: TOPIC_TYPE,
    title,
    created: resolveStoredCreated(created).created,
    ttl: null,
    content: String(Math.max(0, Number(count ?? 0))),
  };
}

export async function listAuthenticatedItems(req, redis, paths, {
  onlyTopics = false,
  excludeTopics = false,
  isExport = false,
} = {}) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return [];
  }

  const keys = paths.map((path) => `${LINKS_PREFIX}${path}`);
  const [storedValues, ttlValues] = await Promise.all([
    readStoredValues(redis, keys),
    readTtlValues(redis, keys),
  ]);

  const filteredEntries = [];
  const topicPaths = [];

  storedValues.forEach((storedValue, index) => {
    if (!storedValue) {
      return;
    }

    const path = paths[index];
    const parsedValue = parseStoredValue(storedValue);
    const isTopic = parsedValue.type === TOPIC_TYPE;

    if (onlyTopics && !isTopic) {
      return;
    }

    if (excludeTopics && isTopic) {
      return;
    }

    if (isTopic) {
      topicPaths.push(path);
    }

    filteredEntries.push({
      path,
      parsedValue,
      ttlSeconds: ttlValues[index],
    });
  });

  const topicCounts = await countTopicItemsBatch(redis, topicPaths);
  const topicCountByPath = new Map(
    topicPaths.map((topicPath, index) => [topicPath, topicCounts[index]]),
  );

  return filteredEntries.map(({ path, parsedValue, ttlSeconds }) => {
    if (parsedValue.type === TOPIC_TYPE) {
      return buildTopicResponse(req, {
        path,
        title: resolveTopicDisplayTitle(path, parsedValue),
        created: parsedValue.created,
        count: Number(topicCountByPath.get(path) ?? 0) - 1,
      });
    }

    return buildItemResponse(req, {
      path,
      type: parsedValue.type,
      title: parsedValue.title,
      ttl: ttlMinutesFromSeconds(ttlSeconds),
      content: parsedValue.content,
      created: parsedValue.created,
    }, isExport);
  });
}

export async function findMatchedPaths(redis, {
  prefix,
  onlyTopics = false,
  excludeTopics = false,
} = {}) {
  if (onlyTopics) {
    const topicPaths = await scanTopicPaths(redis);
    return topicPaths.filter((path) => path.startsWith(prefix));
  }

  const storedPaths = await scanStoredPaths(redis);
  if (!excludeTopics) {
    return storedPaths.filter((path) => path.startsWith(prefix));
  }

  const matchedPaths = storedPaths.filter((path) => path.startsWith(prefix));
  if (matchedPaths.length === 0) {
    return [];
  }

  const storedValues = await readStoredValues(
    redis,
    matchedPaths.map((path) => `${LINKS_PREFIX}${path}`),
  );

  return matchedPaths.filter((path, index) => {
    const storedValue = storedValues[index];
    if (!storedValue) {
      return false;
    }

    return parseStoredValue(storedValue).type !== TOPIC_TYPE;
  });
}
