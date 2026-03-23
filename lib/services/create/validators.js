import {
  buildUploadedFilePath,
  normalizeLinkPath,
  validateLinkPath,
} from '../../utils/link-path.js';
import { normalizeCreatedInput } from '../../utils/storage.js';
import { isReservedAssetPath, reservedAssetPathError } from '../../assets/http.js';
import { TOPIC_TYPE } from '../topic-store.js';
import { normalizeUrlContent, normalizeWriteType, parseTtlMinutes } from '../link-entry.js';

export const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10;
export const MAX_CONTENT_SIZE_KB = parseInt(process.env.MAX_CONTENT_SIZE_KB, 10) || 500;
export const JSON_BODY_MARGIN_BYTES = 12 * 1024;
export const JSON_CREATE_MAX_BYTES = Math.min(
  (MAX_CONTENT_SIZE_KB * 1024) + JSON_BODY_MARGIN_BYTES,
  512 * 1024,
);
export const VALID_REQUEST_TYPES = ['url', 'text', 'html', 'md', 'md2html', 'qrcode', TOPIC_TYPE];

export function validateRequiredPathForPut(req, inputPath) {
  if (req.method === 'PUT' && !inputPath) {
    return '`path` is required for PUT requests';
  }

  return null;
}

export function validateOptionalPath(inputPath) {
  if (!inputPath) {
    return null;
  }

  const validation = validateLinkPath(inputPath);
  return validation.valid ? null : validation.error;
}

export function validateOptionalTopic(inputTopic) {
  if (!inputTopic) {
    return null;
  }

  if (inputTopic === '/') {
    return '`topic` cannot be "/"';
  }

  const validation = validateLinkPath(inputTopic);
  return validation.valid ? null : validation.error;
}

export function validateInputType(inputType) {
  if (inputType === undefined || inputType === '' || VALID_REQUEST_TYPES.includes(inputType)) {
    return null;
  }

  return '`type` must be one of: url, text, html, md, md2html, qrcode, topic';
}

export function validateContentSize(inputContent) {
  const maxBytes = MAX_CONTENT_SIZE_KB * 1024;
  if (Buffer.byteLength(inputContent, 'utf8') <= maxBytes) {
    return null;
  }

  return `Content too large (max ${maxBytes / 1024}KB)`;
}

export function parseJsonTtlOrError(ttlValue) {
  return parseTtlMinutes(ttlValue, { source: 'json' });
}

export function parseFormTtlOrError(ttlValue) {
  return parseTtlMinutes(ttlValue, { source: 'form' });
}

export function normalizeJsonMutationInput(body) {
  let {
    url: inputContent,
    ttl,
    title = '',
    type: inputType,
    convert,
    path,
    topic = '',
    created,
  } = body;
  const titleProvided = Object.prototype.hasOwnProperty.call(body, 'title');
  const createdProvided = Object.prototype.hasOwnProperty.call(body, 'created');
  const ttlProvided = ttl !== undefined && ttl !== null && ttl !== '';

  path = normalizeLinkPath(path);
  topic = normalizeLinkPath(topic);
  inputType = normalizeWriteType(inputType, convert);
  const normalizedTtl = parseJsonTtlOrError(ttl);
  const normalizedCreated = createdProvided ? normalizeCreatedInput(created) : null;

  return {
    inputContent,
    normalizedTtl,
    title,
    titleProvided,
    inputType,
    path,
    topic,
    created: normalizedCreated,
    createdProvided,
    ttlProvided,
  };
}

export function validateTextMutationInput({ path, topic, inputType, inputContent }) {
  const pathValidationError = validateOptionalPath(path);
  if (pathValidationError) {
    throw new Error(pathValidationError);
  }

  const topicValidationError = validateOptionalTopic(topic);
  if (topicValidationError) {
    throw new Error(topicValidationError);
  }

  const inputTypeValidationError = validateInputType(inputType);
  if (inputTypeValidationError) {
    throw new Error(inputTypeValidationError);
  }

  if (!inputContent) {
    throw new Error('`url` is required');
  }
}

export function validateRequestedUploadPath({ req, inputPath, inputTopic, originalFilename }) {
  const pathRequiredError = validateRequiredPathForPut(req, inputPath);
  if (pathRequiredError) {
    throw new Error(pathRequiredError);
  }

  const normalizedPath = normalizeLinkPath(inputPath);
  const normalizedTopic = normalizeLinkPath(inputTopic);
  const pathValidationError = validateOptionalPath(normalizedPath);
  if (pathValidationError) {
    throw new Error(pathValidationError);
  }

  const topicValidationError = validateOptionalTopic(normalizedTopic);
  if (topicValidationError) {
    throw new Error(topicValidationError);
  }

  const fileExtension = originalFilename || '';
  const requestedPath = buildUploadedFilePath(normalizedPath, fileExtension);
  if (requestedPath && isReservedAssetPath(requestedPath)) {
    throw new Error(reservedAssetPathError(requestedPath));
  }

  return {
    normalizedPath,
    normalizedTopic,
    requestedPath,
  };
}

export function normalizeUploadMetadata(fields) {
  const createdProvided = Object.prototype.hasOwnProperty.call(fields, 'created');
  return {
    title: fields.title || '',
    ttl: parseFormTtlOrError(fields.ttl),
    created: createdProvided ? normalizeCreatedInput(fields.created) : null,
    createdProvided,
  };
}

export function normalizeTextContent(inputContent, inputType) {
  if (inputType === 'url') {
    return normalizeUrlContent(inputContent);
  }

  return inputContent;
}

export function ensureCreatePathIsNotReserved(path) {
  if (isReservedAssetPath(path)) {
    throw new Error(reservedAssetPathError(path));
  }
}
