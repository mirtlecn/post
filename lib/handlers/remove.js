/**
 * Delete a stored link by path.
 */

import { getRedisClient } from '../redis.js';
import { jsonResponse, errorResponse } from '../utils/response.js';
import {
  LINKS_PREFIX,
  parseStoredValue,
  previewContent,
  parseRequestBodyWithLimit,
  resolveStoredCreated,
} from '../utils/storage.js';
import { isS3Configured, deleteFileFromS3 } from '../utils/s3.js';
import { clearFileCache } from '../utils/file-cache.js';
import { normalizeLinkPath } from '../utils/link-path.js';
import { isReservedAssetPath, reservedAssetPathError } from '../assets/http.js';
import {
  TOPIC_TYPE,
  deleteTopic,
  deleteTopicItem,
  ensureTopicHomeIsWritable,
  resolveTopicPath,
} from '../services/topic-store.js';
import { findMatchedPaths, parseTrailingWildcardPath } from './authenticated-query.js';

function normalizeRequestedType(inputType, convert) {
  if (inputType && convert && inputType !== convert) {
    throw new Error('`type` and `convert` must match when both are provided');
  }

  return inputType || convert || '';
}

async function clearStoredFileCache(redis, path) {
  try {
    await clearFileCache(redis, path);
  } catch (error) {
    console.warn('Failed to clear file cache:', error);
  }
}

async function deleteStoredFileIfNeeded(entry) {
  if (entry.type !== 'file') {
    return;
  }

  if (isS3Configured()) {
    try {
      await deleteFileFromS3(entry.content);
    } catch (error) {
      console.error(`Failed to delete ${entry.content} from S3`, error);
    }
    return;
  }

  console.warn('S3 not configured, skipping deletion of', entry.content);
}

function buildDeletePayload(path, entry, isExport) {
  return {
    deleted: path,
    type: entry.type,
    title: entry.title,
    created: resolveStoredCreated(entry.created).created,
    content: isExport
      ? entry.content
      : previewContent(entry.type, entry.content),
  };
}

export async function deleteStoredPath({
  redis,
  path,
  requestedType = '',
  isExport = false,
}) {
  if (requestedType === TOPIC_TYPE) {
    const deletedTopic = await deleteTopic(redis, path);
    if (!deletedTopic) {
      return {
        ok: false,
        status: 404,
        error: { code: 'not_found', message: `path "${path}" not found` },
      };
    }

    return {
      ok: true,
      data: {
        deleted: path,
        type: deletedTopic.type,
        title: deletedTopic.title,
        created: resolveStoredCreated(deletedTopic.created).created,
        content: deletedTopic.content,
      },
    };
  }

  if (await ensureTopicHomeIsWritable(redis, path)) {
    return {
      ok: false,
      status: 400,
      error: { code: 'invalid_request', message: 'topic home must be managed with `type=topic`' },
    };
  }

  const resolvedTopicPath = await resolveTopicPath(redis, { path });
  if (resolvedTopicPath.isTopicItem) {
    const deletedEntry = await deleteTopicItem({
      redis,
      topicName: resolvedTopicPath.topicName,
      relativePath: resolvedTopicPath.relativePath,
      fullPath: resolvedTopicPath.fullPath,
      clearPathCache: (targetPath) => clearStoredFileCache(redis, targetPath),
    });

    if (!deletedEntry) {
      return {
        ok: false,
        status: 404,
        error: { code: 'not_found', message: `path "${path}" not found` },
      };
    }

    await deleteStoredFileIfNeeded(deletedEntry);

    return {
      ok: true,
      data: buildDeletePayload(resolvedTopicPath.fullPath, deletedEntry, isExport),
    };
  }

  const key = LINKS_PREFIX + path;
  const existing = await redis.get(key);
  if (!existing) {
    return {
      ok: false,
      status: 404,
      error: { code: 'not_found', message: `path "${path}" not found` },
    };
  }

  const parsedValue = parseStoredValue(existing);

  await redis.del(key);
  await clearStoredFileCache(redis, path);
  await deleteStoredFileIfNeeded(parsedValue);

  return {
    ok: true,
    data: buildDeletePayload(path, parsedValue, isExport),
  };
}

export async function deleteWildcardPaths({
  redis,
  prefix,
  requestedType = '',
  isExport = false,
  findMatchedPathsFn = findMatchedPaths,
  deleteStoredPathFn = deleteStoredPath,
}) {
  const matchedPaths = await findMatchedPathsFn(redis, {
    prefix,
    onlyTopics: requestedType === TOPIC_TYPE,
    excludeTopics: requestedType !== TOPIC_TYPE,
  });

  const summary = {
    deleted: [],
    errors: [],
  };

  for (const matchedPath of matchedPaths) {
    try {
      const result = await deleteStoredPathFn({
        redis,
        path: matchedPath,
        requestedType,
        isExport,
      });

      if (result.ok) {
        summary.deleted.push(result.data);
        continue;
      }

      summary.errors.push({
        path: matchedPath,
        code: result.error.code,
        message: result.error.message,
      });
    } catch (error) {
      summary.errors.push({
        path: matchedPath,
        code: 'internal',
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  return summary;
}

export async function handleDelete(req, res) {
  const isExport = req.headers['x-export'] === 'true';
  let body;
  try {
    body = await parseRequestBodyWithLimit(req, { maxBytes: JSON_DELETE_MAX_BYTES });
  } catch (error) {
    if (error?.status === 413) {
      return errorResponse(res, { code: 'payload_too_large', message: 'Request body too large' }, 413);
    }

    return errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
  }

  const normalizedPath = normalizeLinkPath(body.path);
  const { type, convert } = body;
  const path = normalizedPath;
  if (!path) {
    return errorResponse(res, { code: 'invalid_request', message: '`path` is required' }, 400);
  }
  if (isReservedAssetPath(path)) {
    return errorResponse(res, { code: 'invalid_request', message: reservedAssetPathError(path) }, 400);
  }

  const redis = await getRedisClient();
  let requestedType;
  try {
    requestedType = normalizeRequestedType(type, convert);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }
  let wildcardPath;
  try {
    wildcardPath = parseTrailingWildcardPath(path);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  if (wildcardPath.isWildcard) {
    const summary = await deleteWildcardPaths({
      redis,
      prefix: wildcardPath.prefix,
      requestedType,
      isExport,
    });
    return jsonResponse(res, summary, 200);
  }

  const result = await deleteStoredPath({
    redis,
    path,
    requestedType,
    isExport,
  });

  if (!result.ok) {
    return errorResponse(res, result.error, result.status);
  }

  return jsonResponse(res, result.data, 200);
}
const JSON_DELETE_MAX_BYTES = 64 * 1024;
