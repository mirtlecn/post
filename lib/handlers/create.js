import { getRedisClient } from '../redis.js';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { resolveUploadedFileContentType } from '../utils/file-mime.js';
import {
  parseStoredValue,
  resolveStoredCreated,
} from '../utils/storage.js';
import { convertToQrCode } from '../utils/converter.js';
import { isS3Configured, uploadFileToS3 } from '../utils/s3.js';
import {
  buildUploadedFilePath,
  generateRandomPath,
} from '../utils/link-path.js';
import {
  detectContentType,
  normalizeWriteType,
} from '../services/link-entry.js';
import {
  TOPIC_TYPE,
  countTopicItems,
  createTopic,
  ensureTopicHomeIsWritable,
  getTopicDisplayTitle,
  refreshTopic,
  resolveTopicPath,
} from '../services/topic-store.js';
import {
  buildTopicMutationSuccessPayload,
} from '../services/create/responses.js';
import {
  deleteUploadedObject,
  persistEntry,
  persistTopicEntry,
} from '../services/create/writer.js';
import {
  getUploadedFile,
  getUploadedFileExtension,
  parseCreateJsonBody,
  parseMultipartForm,
} from '../services/create/request-parser.js';
import {
  ensureCreatePathIsNotReserved,
  normalizeJsonMutationInput,
  normalizeTextContent,
  normalizeUploadMetadata,
  validateContentSize,
  validateInputType,
  validateOptionalPath,
  validateOptionalTopic,
  validateRequiredPathForPut,
  parseJsonTtlOrError,
  validateTextMutationInput,
} from '../services/create/validators.js';

async function handleTopicMutation(req, res, {
  path,
  title,
  titleProvided,
  created,
  createdProvided,
  ttlProvided,
  allowOverwrite,
  requestReceivedAt,
}) {
  if (!path) {
    return errorResponse(res, { code: 'invalid_request', message: '`path` is required' }, 400);
  }

  if (ttlProvided) {
    return errorResponse(res, { code: 'invalid_request', message: 'topic does not support ttl' }, 400);
  }

  const redis = await getRedisClient();
  const existingTopic = await ensureTopicHomeIsWritable(redis, path);
  const existingStoredValue = await redis.get(`surl:${path}`);

  if (existingStoredValue && !existingTopic) {
    return errorResponse(
      res,
      { code: 'conflict', message: `path "${path}" already exists`, hint: allowOverwrite ? undefined : 'Use PUT to overwrite' },
      409,
    );
  }

  if (existingTopic && !allowOverwrite) {
    return errorResponse(
      res,
      { code: 'conflict', message: `path "${path}" already exists`, hint: 'Use PUT to overwrite' },
      409,
    );
  }

  if (!existingTopic && allowOverwrite) {
    await createTopic(redis, path, { title, titleProvided, created, createdProvided, requestReceivedAt });
  } else if (existingTopic && allowOverwrite) {
    await refreshTopic(redis, path, { title, titleProvided, created, createdProvided, requestReceivedAt });
  } else {
    await createTopic(redis, path, { title, titleProvided, created, createdProvided, requestReceivedAt });
  }

  const itemCount = await countTopicItems(redis, path);
  const storedTopic = parseStoredValue(await redis.get(`surl:${path}`));
  const topicTitle = await getTopicDisplayTitle(redis, path);
  return jsonResponse(
    res,
    buildTopicMutationSuccessPayload({
      req,
      path,
      itemCount,
      title: topicTitle,
      storedCreated: storedTopic.created,
    }),
    allowOverwrite ? 200 : 201,
  );
}

async function handleFileUpload(req, res, { allowOverwrite }) {
  const isExport = req.headers['x-export'] === 'true';
  const requestReceivedAt = new Date();
  let fields;
  let files;
  let uploadedObjectKey = '';
  let resolvedFileContentType = 'application/octet-stream';

  try {
    ({ fields, files } = await parseMultipartForm(req));
  } catch (error) {
    return errorResponse(
      res,
      { code: error.code || 'invalid_request', message: error.message },
      error.status || 400,
    );
  }

  const uploadedFile = getUploadedFile(files);
  if (!uploadedFile) {
    return errorResponse(
      res,
      { code: 'invalid_request', message: '`file` field is required for multipart/form-data' },
      400,
    );
  }

  let normalizedPath;
  let normalizedTopic;
  try {
    const pathRequiredError = validateRequiredPathForPut(req, fields.path);
    if (pathRequiredError) {
      throw new Error(pathRequiredError);
    }
    normalizedPath = fields.path ? fields.path.replace(/^\/+/, '').replace(/\/+$/, '') : '';
    normalizedTopic = fields.topic ? fields.topic.replace(/^\/+/, '').replace(/\/+$/, '') : '';
    const pathValidationError = validateOptionalPath(normalizedPath);
    if (pathValidationError) {
      throw new Error(pathValidationError);
    }
    const topicValidationError = validateOptionalTopic(normalizedTopic);
    if (topicValidationError) {
      throw new Error(topicValidationError);
    }
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  const fileExtension = getUploadedFileExtension(uploadedFile);
  const requestedPath = buildUploadedFilePath(normalizedPath, fileExtension);
  try {
    ensureCreatePathIsNotReserved(requestedPath);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }
  let uploadMeta;
  try {
    uploadMeta = normalizeUploadMetadata(fields);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  try {
    resolvedFileContentType = await resolveUploadedFileContentType({
      clientContentType: uploadedFile.mimetype,
      originalFilename: uploadedFile.originalFilename,
      filepath: uploadedFile.filepath,
    });

    const redis = await getRedisClient();
    if (requestedPath && await ensureTopicHomeIsWritable(redis, requestedPath)) {
      return errorResponse(
        res,
        { code: 'invalid_request', message: 'topic home must be managed with `type=topic`' },
        400,
      );
    }

    const uploadSeconds = uploadMeta.ttl.ttlSeconds || 0;
    uploadedObjectKey = await uploadFileToS3(uploadedFile, uploadSeconds, resolvedFileContentType);

    let resolvedTopicPath;
    try {
      resolvedTopicPath = await resolveTopicPath(redis, {
        topicName: normalizedTopic || '',
        path: requestedPath,
      });
    } catch (error) {
      await deleteUploadedObject(uploadedObjectKey);
      return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
    }

    const persistResult = resolvedTopicPath.isTopicItem
      ? await persistTopicEntry({
          req,
          path: resolvedTopicPath.fullPath,
          topicName: resolvedTopicPath.topicName,
          relativePath: resolvedTopicPath.relativePath,
          type: 'file',
          content: uploadedObjectKey,
          title: uploadMeta.title,
          created: uploadMeta.created,
          createdProvided: uploadMeta.createdProvided,
          allowOverwrite,
          ttlValue: uploadMeta.ttl.expiresIn ?? 0,
          isExport,
          requestReceivedAt,
        })
      : await persistEntry({
          req,
          path: requestedPath,
          type: 'file',
          content: uploadedObjectKey,
          title: uploadMeta.title,
          created: uploadMeta.created,
          createdProvided: uploadMeta.createdProvided,
          allowOverwrite,
          ttlValue: uploadMeta.ttl.expiresIn ?? 0,
          isExport,
          requestReceivedAt,
        });

    if (persistResult.conflictPayload) {
      await deleteUploadedObject(uploadedObjectKey);
      return errorResponse(res, persistResult.conflictPayload, 409);
    }

    return jsonResponse(res, persistResult.responsePayload, persistResult.statusCode);
  } catch (error) {
    console.error('File upload error:', error);
    await deleteUploadedObject(uploadedObjectKey);
    return errorResponse(res, { code: 'internal', message: 'Failed to upload file' }, 500);
  }
}

async function handleJsonRequest(req, res, { allowOverwrite }) {
  const isExport = req.headers['x-export'] === 'true';
  const requestReceivedAt = new Date();
  let body;

  try {
    body = await parseCreateJsonBody(req);
  } catch (error) {
    if (error?.status === 413) {
      return errorResponse(res, { code: 'payload_too_large', message: 'Request body too large' }, 413);
    }

    return errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
  }

  let input;
  try {
    input = normalizeJsonMutationInput(body);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  if (input.inputType === TOPIC_TYPE) {
    return handleTopicMutation(req, res, {
      path: input.path,
      title: input.title,
      titleProvided: input.titleProvided,
      created: input.created,
      createdProvided: input.createdProvided,
      ttlProvided: input.ttlProvided,
      allowOverwrite,
      requestReceivedAt,
    });
  }

  try {
    validateTextMutationInput(input);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  const path = input.path || generateRandomPath();
  try {
    ensureCreatePathIsNotReserved(path);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  let normalizedContent;
  try {
    normalizedContent = normalizeTextContent(input.inputContent, input.inputType);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  const redis = await getRedisClient();
  if (await ensureTopicHomeIsWritable(redis, path)) {
    return errorResponse(
      res,
      { code: 'invalid_request', message: 'topic home must be managed with `type=topic`' },
      400,
    );
  }

  let resolvedTopicPath;
  try {
    resolvedTopicPath = await resolveTopicPath(redis, { topicName: input.topic, path });
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  const contentType = detectContentType(normalizedContent, input.inputType);
  const contentSizeError = validateContentSize(normalizedContent);
  if (contentSizeError) {
    return errorResponse(res, { code: 'payload_too_large', message: contentSizeError }, 413);
  }

  if (contentType === 'qrcode') {
    try {
      await convertToQrCode(normalizedContent);
    } catch (error) {
      return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
    }
  }

  const persistResult = resolvedTopicPath.isTopicItem
    ? await persistTopicEntry({
        req,
        path: resolvedTopicPath.fullPath,
        topicName: resolvedTopicPath.topicName,
        relativePath: resolvedTopicPath.relativePath,
        type: contentType,
        content: normalizedContent,
        title: input.title,
        created: input.created,
        createdProvided: input.createdProvided,
        allowOverwrite,
        ttlValue: input.normalizedTtl.expiresIn ?? 0,
        isExport,
        requestReceivedAt,
      })
    : await persistEntry({
        req,
        path,
        type: contentType,
        content: normalizedContent,
        title: input.title,
        created: input.created,
        createdProvided: input.createdProvided,
        allowOverwrite,
        ttlValue: input.normalizedTtl.expiresIn ?? 0,
        isExport,
        requestReceivedAt,
      });

  if (persistResult.conflictPayload) {
    return errorResponse(res, persistResult.conflictPayload, 409);
  }

  return jsonResponse(res, persistResult.responsePayload, persistResult.statusCode);
}

async function writeEntry(req, res, { allowOverwrite }) {
  const contentTypeHeader = req.headers['content-type'] || '';
  if (contentTypeHeader.startsWith('multipart/form-data')) {
    if (!isS3Configured()) {
      return errorResponse(
        res,
        { code: 's3_not_configured', message: 'S3 service is not configured' },
        501,
      );
    }

    return handleFileUpload(req, res, { allowOverwrite });
  }

  return handleJsonRequest(req, res, { allowOverwrite });
}

export async function handleCreate(req, res) {
  return writeEntry(req, res, { allowOverwrite: false });
}

export async function handleReplace(req, res) {
  return writeEntry(req, res, { allowOverwrite: true });
}

export {
  normalizeWriteType,
  validateRequiredPathForPut,
  validateOptionalPath,
  validateOptionalTopic,
  validateInputType,
  validateContentSize,
};
