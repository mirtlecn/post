import { getRedisClient } from '../../redis.js';
import { clearFileCache } from '../../utils/file-cache.js';
import {
  buildCurrentCreatedValue,
  buildStoredValue,
  parseStoredValue,
} from '../../utils/storage.js';
import { isS3Configured, deleteFileFromS3 } from '../../utils/s3.js';
import { parseTtlMinutes, writeStoredLink } from '../link-entry.js';
import { writeTopicItem } from '../topic-store.js';
import {
  buildCreateConflictPayload,
  buildCreateSuccessPayload,
} from './responses.js';

async function clearStoredFileCache(redis, path) {
  try {
    await clearFileCache(redis, path);
  } catch (error) {
    console.warn('Failed to clear file cache:', error);
  }
}

export function resolveCreatedForWrite({
  existingStoredValue,
  created,
  createdProvided,
  requestReceivedAt,
}) {
  if (createdProvided) {
    return created;
  }

  if (existingStoredValue) {
    return parseStoredValue(existingStoredValue).created;
  }

  return buildCurrentCreatedValue(requestReceivedAt);
}

export async function deleteUploadedObject(objectKey) {
  if (!objectKey || !isS3Configured()) {
    return;
  }

  try {
    await deleteFileFromS3(objectKey);
  } catch (error) {
    console.error(`Failed to delete uploaded object ${objectKey}`, error);
  }
}

async function writeCreateEntry({
  req,
  path,
  type,
  content,
  title,
  created,
  createdProvided,
  allowOverwrite,
  ttlValue,
  isExport,
  requestReceivedAt,
  write,
  resolveConflictExpiresIn,
}) {
  const redis = await getRedisClient();
  const storageKey = `surl:${path}`;
  const existingStoredValue = await redis.get(storageKey);
  const storedCreated = resolveCreatedForWrite({
    existingStoredValue,
    created,
    createdProvided,
    requestReceivedAt,
  });
  const storedValue = buildStoredValue({ type, content, title, created: storedCreated });
  const writeResult = await write({
    redis,
    path,
    storedValue,
    allowOverwrite,
    ttlValue,
    existingStoredValue,
    clearPathCache: (targetPath) => clearStoredFileCache(redis, targetPath),
  });

  if (writeResult.existingStoredValue && !allowOverwrite) {
    return {
      conflictPayload: buildCreateConflictPayload({
        req,
        path,
        existingStoredValue: writeResult.existingStoredValue,
        isExport,
        existingExpiresIn: resolveConflictExpiresIn(writeResult),
      }),
    };
  }

  return {
    responsePayload: buildCreateSuccessPayload({
      req,
      path,
      type,
      content,
      title,
      created: storedCreated,
      isExport,
      expiresIn: writeResult.expiresIn,
      overwrittenStoredValue: writeResult.didOverwrite ? writeResult.existingStoredValue : null,
      ttlWarning: writeResult.ttlWarning,
    }),
    statusCode: !allowOverwrite || !writeResult.didOverwrite ? 201 : 200,
  };
}

export async function persistEntry(options) {
  return writeCreateEntry({
    ...options,
    write: ({
      redis,
      path,
      storedValue,
      allowOverwrite,
      ttlValue,
      existingStoredValue,
      clearPathCache,
    }) => writeStoredLink({
      redis,
      path,
      storedValue,
      allowOverwrite,
      ttlValue,
      existingStoredValue,
      clearPathCache,
    }),
    resolveConflictExpiresIn: () => null,
  });
}

export async function persistTopicEntry({
  req,
  path,
  topicName,
  relativePath,
  type,
  content,
  title,
  created,
  createdProvided,
  allowOverwrite,
  ttlValue,
  isExport,
  requestReceivedAt,
}) {
  const ttl = parseTtlMinutes(ttlValue);
  return writeCreateEntry({
    req,
    path,
    type,
    content,
    title,
    created,
    createdProvided,
    allowOverwrite,
    ttlValue,
    isExport,
    requestReceivedAt,
    write: ({
      redis,
      path: fullPath,
      storedValue,
      allowOverwrite: allowOverwriteWrite,
      existingStoredValue,
      clearPathCache,
    }) => writeTopicItem({
      redis,
      topicName,
      relativePath,
      fullPath,
      storedValue,
      allowOverwrite: allowOverwriteWrite,
      ttlSeconds: ttl.ttlSeconds,
      existingStoredValue,
      clearPathCache,
    }),
    resolveConflictExpiresIn: (writeResult) => (
      writeResult.existingTtlSeconds
        ? Math.max(1, Math.ceil(writeResult.existingTtlSeconds / 60))
        : null
    ),
  });
}
