import path from 'path';
import { getRedisClient as getDefaultRedisClient } from '../../redis.js';
import { errorResponse, jsonResponse } from '../../utils/response.js';
import { LINKS_PREFIX, normalizeCreatedInput, parseRequestBodyWithLimit } from '../../utils/storage.js';
import { buildUploadedFilePath, normalizeLinkPath } from '../../utils/link-path.js';
import { resolveUploadedFileContentType } from '../../utils/file-mime.js';
import {
  copyObject,
  deleteFileFromS3,
  generatePresignedPutUrl,
  generateUUID,
  getObjectKeyPrefix,
  getSignedUploadUrlTtlSeconds,
  headObject,
  isS3Configured,
} from '../../utils/s3.js';
import {
  ensureTopicHomeIsWritable,
  resolveTopicPath,
} from '../topic-store.js';
import {
  persistEntry,
  persistTopicEntry,
} from './writer.js';
import {
  MAX_FILE_SIZE_MB,
  ensureCreatePathIsNotReserved,
  parseJsonTtlOrError,
  validateOptionalPath,
  validateOptionalTopic,
  validateRequiredPathForUpdate,
} from './validators.js';

const DIRECT_UPLOAD_BODY_MAX_BYTES = 64 * 1024;
const DIRECT_UPLOAD_SESSION_TTL_SECONDS = 60 * 60;
const STAGING_KEY_PREFIX = 'post/staging/';

function pendingUploadKey(uploadId) {
  return `upload:staging:${uploadId}`;
}

function normalizeBoolean(value) {
  return value === true || value === 'true';
}

function normalizeTitle(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeFilename(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeUploadId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBodyOrRespond(req, res) {
  return parseRequestBodyWithLimit(req, { maxBytes: DIRECT_UPLOAD_BODY_MAX_BYTES })
    .catch((error) => {
      if (error?.status === 413) {
        errorResponse(res, { code: 'payload_too_large', message: 'Request body too large' }, 413);
        return null;
      }

      errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
      return null;
    });
}

function validateFileSize(size) {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error('`size` must be a positive integer');
  }

  const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
  if (size > maxBytes) {
    const error = new Error(`File too large (max ${MAX_FILE_SIZE_MB}MB)`);
    error.status = 413;
    error.code = 'payload_too_large';
    throw error;
  }
}

function normalizeDirectUploadInput(body) {
  const filename = normalizeFilename(body?.filename);
  const fileExtension = path.extname(filename).toLowerCase();
  const allowOverwrite = normalizeBoolean(body?.allowOverwrite);
  const preservePath = allowOverwrite && normalizeBoolean(body?.preservePath);
  const normalizedPath = normalizeLinkPath(body?.path);
  const normalizedTopic = normalizeLinkPath(body?.topic);
  const pathRequiredError = validateRequiredPathForUpdate(allowOverwrite, normalizedPath);
  if (pathRequiredError) {
    throw new Error(pathRequiredError);
  }

  const pathValidationError = validateOptionalPath(normalizedPath);
  if (pathValidationError) {
    throw new Error(pathValidationError);
  }

  const topicValidationError = validateOptionalTopic(normalizedTopic);
  if (topicValidationError) {
    throw new Error(topicValidationError);
  }

  if (preservePath && normalizedTopic) {
    throw new Error('`topic` is not supported when preserving an upload path');
  }

  const requestedPath = preservePath
    ? normalizedPath
    : buildUploadedFilePath(normalizedPath, fileExtension);
  ensureCreatePathIsNotReserved(requestedPath);

  const size = Number(body?.size);
  validateFileSize(size);

  const ttl = parseJsonTtlOrError(body?.ttl);
  const createdProvided = Object.prototype.hasOwnProperty.call(body || {}, 'created');
  const created = createdProvided ? normalizeCreatedInput(body.created) : null;

  return {
    allowOverwrite,
    preservePath,
    requestedPath,
    normalizedTopic,
    filename,
    fileExtension,
    size,
    title: normalizeTitle(body?.title),
    ttl,
    created,
    createdProvided,
    clientContentType: typeof body?.contentType === 'string' ? body.contentType : '',
  };
}

function buildConflictPayload(path) {
  return {
    code: 'conflict',
    message: `path "${path}" already exists`,
    hint: 'Use POST /update to overwrite',
  };
}

async function resolveUploadTarget(redis, input) {
  if (input.requestedPath && await ensureTopicHomeIsWritable(redis, input.requestedPath)) {
    const error = new Error('topic home must be managed with `type=topic`');
    error.status = 400;
    error.code = 'invalid_request';
    throw error;
  }

  return resolveTopicPath(redis, {
    topicName: input.normalizedTopic || '',
    path: input.requestedPath,
  });
}

function buildPendingUpload({ input, uploadId, stagingKey, contentType, resolvedTopicPath, requestReceivedAt }) {
  return {
    uploadId,
    stagingKey,
    expectedSize: input.size,
    contentType,
    requestedPath: input.requestedPath,
    normalizedTopic: input.normalizedTopic,
    resolvedPath: resolvedTopicPath.fullPath,
    isTopicItem: resolvedTopicPath.isTopicItem,
    topicName: resolvedTopicPath.topicName,
    relativePath: resolvedTopicPath.relativePath,
    title: input.title,
    ttlValue: input.ttl.expiresIn ?? 0,
    ttlSeconds: input.ttl.ttlSeconds || 0,
    created: input.created,
    createdProvided: input.createdProvided,
    allowOverwrite: input.allowOverwrite,
    preservePath: input.preservePath,
    fileExtension: input.fileExtension,
    requestReceivedAt: requestReceivedAt.toISOString(),
  };
}

function isObjectNotFoundError(error) {
  return ['NotFound', 'NoSuchKey', 'NotFoundError'].includes(error?.name)
    || ['NotFound', 'NoSuchKey'].includes(error?.Code)
    || error?.$metadata?.httpStatusCode === 404;
}

async function cleanupPendingUpload({ redis, s3, pendingKey, stagingKey, finalKey = '' }) {
  await Promise.allSettled([
    finalKey ? s3.deleteFileFromS3(finalKey) : Promise.resolve(),
    stagingKey ? s3.deleteFileFromS3(stagingKey) : Promise.resolve(),
    pendingKey ? redis.del(pendingKey) : Promise.resolve(),
  ]);
}

function createS3Facade() {
  return {
    isS3Configured,
    generatePresignedPutUrl,
    getSignedUploadUrlTtlSeconds,
    headObject,
    copyObject,
    deleteFileFromS3,
    generateUUID,
    getObjectKeyPrefix,
  };
}

export function createDirectUploadHandlers({
  getRedisClient = getDefaultRedisClient,
  s3 = createS3Facade(),
} = {}) {
  async function handlePrepareUpload(req, res) {
    if (!s3.isS3Configured()) {
      return errorResponse(res, { code: 's3_not_configured', message: 'S3 service is not configured' }, 501);
    }

    const body = await parseBodyOrRespond(req, res);
    if (!body) {
      return undefined;
    }

    let input;
    try {
      input = normalizeDirectUploadInput(body);
    } catch (error) {
      return errorResponse(
        res,
        { code: error.code || 'invalid_request', message: error.message },
        error.status || 400,
      );
    }

    const redis = await getRedisClient();
    let resolvedTopicPath;
    try {
      resolvedTopicPath = await resolveUploadTarget(redis, input);
    } catch (error) {
      return errorResponse(
        res,
        { code: error.code || 'invalid_request', message: error.message },
        error.status || 400,
      );
    }

    if (!input.allowOverwrite && resolvedTopicPath.fullPath) {
      const existingStoredValue = await redis.get(`${LINKS_PREFIX}${resolvedTopicPath.fullPath}`);
      if (existingStoredValue) {
        return errorResponse(res, buildConflictPayload(resolvedTopicPath.fullPath), 409);
      }
    }

    const requestReceivedAt = new Date();
    const uploadId = s3.generateUUID();
    const stagingKey = `${STAGING_KEY_PREFIX}${uploadId}${input.fileExtension}`;
    const contentType = await resolveUploadedFileContentType({
      clientContentType: input.clientContentType,
      originalFilename: input.filename,
    });
    const uploadUrl = await s3.generatePresignedPutUrl(
      stagingKey,
      contentType,
      s3.getSignedUploadUrlTtlSeconds(),
    );
    const pending = buildPendingUpload({
      input,
      uploadId,
      stagingKey,
      contentType,
      resolvedTopicPath,
      requestReceivedAt,
    });

    await redis.setEx(
      pendingUploadKey(uploadId),
      DIRECT_UPLOAD_SESSION_TTL_SECONDS,
      JSON.stringify(pending),
    );

    return jsonResponse(res, {
      uploadId,
      uploadUrl,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
    }, 200);
  }

  async function handleCompleteUpload(req, res) {
    if (!s3.isS3Configured()) {
      return errorResponse(res, { code: 's3_not_configured', message: 'S3 service is not configured' }, 501);
    }

    const body = await parseBodyOrRespond(req, res);
    if (!body) {
      return undefined;
    }

    const uploadId = normalizeUploadId(body.uploadId);
    if (!uploadId) {
      return errorResponse(res, { code: 'invalid_request', message: '`uploadId` is required' }, 400);
    }

    const redis = await getRedisClient();
    const pendingKey = pendingUploadKey(uploadId);
    const storedPending = await redis.get(pendingKey);
    if (!storedPending) {
      return errorResponse(res, { code: 'upload_not_found', message: 'Upload not found' }, 404);
    }

    let pending;
    try {
      pending = JSON.parse(storedPending);
    } catch {
      await redis.del(pendingKey);
      return errorResponse(res, { code: 'upload_not_found', message: 'Upload not found' }, 404);
    }

    let objectMeta;
    try {
      objectMeta = await s3.headObject(pending.stagingKey);
    } catch (error) {
      if (isObjectNotFoundError(error)) {
        return errorResponse(res, { code: 'upload_not_found', message: 'Upload not found' }, 404);
      }
      throw error;
    }

    if (objectMeta.contentLength !== pending.expectedSize) {
      await cleanupPendingUpload({ redis, s3, pendingKey, stagingKey: pending.stagingKey });
      return errorResponse(
        res,
        { code: 'upload_size_mismatch', message: 'Uploaded file size does not match the prepared upload' },
        400,
      );
    }

    const input = {
      requestedPath: pending.requestedPath,
      normalizedTopic: pending.normalizedTopic,
      allowOverwrite: pending.allowOverwrite,
    };
    let resolvedTopicPath;
    try {
      resolvedTopicPath = await resolveUploadTarget(redis, input);
    } catch (error) {
      await cleanupPendingUpload({ redis, s3, pendingKey, stagingKey: pending.stagingKey });
      return errorResponse(
        res,
        { code: error.code || 'invalid_request', message: error.message },
        error.status || 400,
      );
    }

    const finalKey = `${s3.getObjectKeyPrefix(pending.ttlSeconds || 0)}${s3.generateUUID()}${pending.fileExtension || ''}`;
    try {
      await s3.copyObject(pending.stagingKey, finalKey);
      const requestReceivedAt = new Date(pending.requestReceivedAt || Date.now());
      const metadata = {
        contentLength: objectMeta.contentLength,
        contentType: objectMeta.contentType || pending.contentType,
      };
      const persistOptions = {
        redis,
        req,
        type: 'file',
        content: finalKey,
        title: pending.title,
        created: pending.created,
        createdProvided: pending.createdProvided,
        metadata,
        allowOverwrite: pending.allowOverwrite,
        ttlValue: pending.ttlValue,
        isExport: req.headers['x-export'] === 'true',
        requestReceivedAt,
      };
      const persistResult = resolvedTopicPath.isTopicItem
        ? await persistTopicEntry({
            ...persistOptions,
            path: resolvedTopicPath.fullPath,
            topicName: resolvedTopicPath.topicName,
            relativePath: resolvedTopicPath.relativePath,
          })
        : await persistEntry({
            ...persistOptions,
            path: pending.requestedPath,
          });

      if (persistResult.conflictPayload) {
        await cleanupPendingUpload({ redis, s3, pendingKey, stagingKey: pending.stagingKey, finalKey });
        return errorResponse(res, persistResult.conflictPayload, 409);
      }

      await cleanupPendingUpload({ redis, s3, pendingKey, stagingKey: pending.stagingKey });
      return jsonResponse(res, persistResult.responsePayload, persistResult.statusCode);
    } catch (error) {
      console.error('Direct upload completion error:', error);
      await cleanupPendingUpload({ redis, s3, pendingKey, stagingKey: pending.stagingKey, finalKey });
      return errorResponse(res, { code: 'internal', message: 'Failed to complete upload' }, 500);
    }
  }

  return {
    handlePrepareUpload,
    handleCompleteUpload,
  };
}

const defaultHandlers = createDirectUploadHandlers();

export const handlePrepareUpload = defaultHandlers.handlePrepareUpload;
export const handleCompleteUpload = defaultHandlers.handleCompleteUpload;
