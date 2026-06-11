import { parseStoredValue } from '../utils/storage.js';
import {
  readStoredTopic,
  readTopicEntries,
  TOPIC_TYPE,
} from './topic-common.js';

export async function topicExists(redis, topicName) {
  if (!topicName) {
    return false;
  }

  const storedTopic = await readStoredTopic(redis, topicName);
  return storedTopic?.type === TOPIC_TYPE;
}

export async function ensureTopicHomeIsWritable(redis, path) {
  const storedTopic = await readStoredTopic(redis, path);
  return storedTopic?.type === TOPIC_TYPE;
}

async function findNestedTopic(redis, topicName, fullPath) {
  const topicPartCount = topicName.split('/').length;
  const pathParts = fullPath.split('/');
  const candidateTopics = [];
  for (let prefixLength = pathParts.length; prefixLength > topicPartCount; prefixLength -= 1) {
    candidateTopics.push(pathParts.slice(0, prefixLength).join('/'));
  }

  const storedCandidates = await readTopicEntries(redis, candidateTopics);
  for (let index = 0; index < candidateTopics.length; index += 1) {
    const storedValue = storedCandidates[index];
    if (!storedValue) {
      continue;
    }

    const parsedValue = parseStoredValue(storedValue);
    if (parsedValue.type === TOPIC_TYPE) {
      return candidateTopics[index];
    }
  }

  return '';
}

export async function resolveTopicPath(redis, { topicName = '', path }) {
  const resolved = {
    isTopicItem: false,
    topicName: '',
    relativePath: '',
    fullPath: path,
    existingTopic: false,
  };

  if (!path) {
    return resolved;
  }

  if (topicName) {
    if (path === '/') {
      throw new Error('`path` cannot be "/" when `topic` is provided');
    }

    const [storedTopicValue] = await readTopicEntries(redis, [topicName]);
    const storedTopic = storedTopicValue ? parseStoredValue(storedTopicValue) : null;
    if (storedTopic?.type !== TOPIC_TYPE) {
      throw new Error('topic does not exist');
    }

    const expectedPrefix = `${topicName}/`;
    let relativePath = path;
    if (path.includes('/')) {
      if (!path.startsWith(expectedPrefix)) {
        throw new Error('`topic` and `path` must match');
      }
      relativePath = path.slice(expectedPrefix.length);
    }

    const fullPath = `${topicName}/${relativePath}`;
    const nestedTopic = await findNestedTopic(redis, topicName, fullPath);
    if (nestedTopic) {
      throw new Error('`topic` and `path` must match');
    }

    return {
      isTopicItem: true,
      topicName,
      relativePath,
      fullPath,
      existingTopic: true,
    };
  }

  const pathParts = path.split('/');
  const candidateTopics = [];
  for (let prefixLength = pathParts.length - 1; prefixLength >= 1; prefixLength -= 1) {
    candidateTopics.push(pathParts.slice(0, prefixLength).join('/'));
  }

  const storedCandidates = await readTopicEntries(redis, candidateTopics);
  for (let index = 0; index < candidateTopics.length; index += 1) {
    const storedValue = storedCandidates[index];
    if (!storedValue) {
      continue;
    }

    const parsedValue = parseStoredValue(storedValue);
    if (parsedValue.type !== TOPIC_TYPE) {
      continue;
    }

    const candidateTopic = candidateTopics[index];
    const prefixLength = candidateTopic.split('/').length;

    return {
      isTopicItem: true,
      topicName: candidateTopic,
      relativePath: pathParts.slice(prefixLength).join('/'),
      fullPath: path,
      existingTopic: true,
    };
  }

  return resolved;
}
