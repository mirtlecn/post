import {
  LINKS_PREFIX,
  parseStoredValue,
  previewContent,
  getDomain,
  resolveStoredCreated,
} from '../utils/storage.js';
import { buildPublicLink } from '../utils/link-path.js';

export const MAX_TTL_MINUTES = 365 * 24 * 60;
export const MAX_TTL_SECONDS = MAX_TTL_MINUTES * 60;

export function normalizeStoredTypeAlias(type = '') {
  if (type === 'md2html') {
    return 'md';
  }

  return type;
}

export function normalizeWriteType(inputType, convert) {
  const normalizedInputType = normalizeStoredTypeAlias(inputType || '');
  const normalizedConvert = normalizeStoredTypeAlias(convert || '');

  if (normalizedInputType && normalizedConvert && normalizedInputType !== normalizedConvert) {
    throw new Error('`type` and `convert` must match when both are provided');
  }

  return normalizedInputType || normalizedConvert;
}

export function buildResponseContent(type, content, isExport) {
  return isExport ? content : previewContent(type, content);
}

export function parseTtlMinutes(ttlValue, { source = 'json' } = {}) {
  if (ttlValue === undefined || ttlValue === null || ttlValue === '') {
    return { expiresIn: null, ttlSeconds: null, warning: null };
  }

  let parsedMinutes;
  if (source === 'form') {
    if (!/^\d+$/.test(ttlValue)) {
      throw new Error('`ttl` must be a natural number');
    }
    parsedMinutes = Number.parseInt(ttlValue, 10);
  } else {
    if (!Number.isInteger(ttlValue) || ttlValue < 0) {
      throw new Error('`ttl` must be a natural number');
    }
    parsedMinutes = ttlValue;
  }

  if (parsedMinutes > MAX_TTL_MINUTES) {
    throw new Error(`\`ttl\` must be between 0 and ${MAX_TTL_MINUTES} minutes`);
  }

  return {
    expiresIn: parsedMinutes === 0 ? null : parsedMinutes,
    ttlSeconds: parsedMinutes === 0 ? null : parsedMinutes * 60,
    warning: null,
  };
}

export async function writeStoredLink({
  redis,
  path,
  storedValue,
  allowOverwrite,
  ttlValue,
  existingStoredValue,
  clearPathCache,
}) {
  const storageKey = `${LINKS_PREFIX}${path}`;
  const currentStoredValue = existingStoredValue ?? await redis.get(storageKey);

  if (currentStoredValue && !allowOverwrite) {
    return {
      didOverwrite: false,
      existingStoredValue: currentStoredValue,
      expiresIn: null,
      storageKey,
      ttlWarning: null,
    };
  }

  if (currentStoredValue && allowOverwrite) {
    await clearPathCache(path);
  }

  const ttl = parseTtlMinutes(ttlValue);
  if (ttl.ttlSeconds) {
    await redis.setEx(storageKey, ttl.ttlSeconds, storedValue);
  } else {
    await redis.set(storageKey, storedValue);
  }

  return {
    didOverwrite: Boolean(currentStoredValue),
    existingStoredValue: currentStoredValue,
    expiresIn: ttl.expiresIn,
    storageKey,
    ttlWarning: ttl.warning,
  };
}

export function buildCreatedEntryPayload({
  req,
  path,
  type,
  content,
  title,
  created,
  isExport,
  expiresIn,
  overwrittenStoredValue,
  ttlWarning,
}) {
  const responsePayload = {
    surl: buildPublicLink(getDomain(req), path),
    path,
    type,
    title,
    created: resolveStoredCreated(created).created,
    content: buildResponseContent(type, content, isExport),
    ttl: expiresIn,
  };

  if (overwrittenStoredValue) {
    const overwrittenEntry = parseStoredValue(overwrittenStoredValue);
    responsePayload.overwritten = buildResponseContent(
      overwrittenEntry.type,
      overwrittenEntry.content,
      isExport,
    );
  }

  return responsePayload;
}

export function normalizeUrlContent(inputContent) {
  const trimmedContent = inputContent.trim();

  try {
    const parsedUrl = new URL(trimmedContent);
    if (!parsedUrl.protocol) {
      throw new Error('missing protocol');
    }
  } catch {
    throw new Error('`url` must be a valid absolute URL with a scheme');
  }

  return trimmedContent;
}

export function detectContentType(inputContent, inputType) {
  if (inputType) {
    return inputType;
  }

  try {
    new URL(inputContent.trim());
    return 'url';
  } catch {
    return 'text';
  }
}
