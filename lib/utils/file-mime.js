import { extname } from 'path';
import { open } from 'fs/promises';

export const GENERIC_CONTENT_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
]);

const TEXT_UTF8_CONTENT_TYPES = new Set([
  'application/json',
  'application/javascript',
  'application/ecmascript',
  'application/x-javascript',
  'application/xml',
  'application/xhtml+xml',
  'application/yaml',
  'application/x-yaml',
  'application/toml',
  'application/x-sh',
  'application/x-shellscript',
]);

const TEXT_UTF8_EXTENSIONS = new Map([
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.html', 'text/html'],
  ['.css', 'text/css'],
  ['.js', 'text/javascript'],
  ['.json', 'application/json'],
]);

const EXTENSION_CONTENT_TYPES = new Map([
  ...TEXT_UTF8_EXTENSIONS.entries(),
  ['.svg', 'image/svg+xml'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon'],
  ['.avif', 'image/avif'],
]);

function normalizeContentType(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function getBaseContentType(value) {
  return normalizeContentType(value).split(';', 1)[0].trim().toLowerCase();
}

function hasCharsetParameter(value) {
  return normalizeContentType(value)
    .split(';')
    .slice(1)
    .some((part) => /^charset\s*=/i.test(part.trim()));
}

function isTextUtf8ContentType(value) {
  const baseContentType = getBaseContentType(value);
  return baseContentType.startsWith('text/')
    || TEXT_UTF8_CONTENT_TYPES.has(baseContentType);
}

export function ensureUtf8CharsetForTextContentType(value) {
  const normalizedValue = normalizeContentType(value);
  if (!normalizedValue) {
    return '';
  }

  if (hasCharsetParameter(normalizedValue) || !isTextUtf8ContentType(normalizedValue)) {
    return normalizedValue;
  }

  return `${normalizedValue.replace(/;\s*$/, '')}; charset=utf-8`;
}

export function isTrustedClientContentType(value) {
  const normalizedValue = normalizeContentType(value);
  if (!normalizedValue) {
    return false;
  }

  return !GENERIC_CONTENT_TYPES.has(getBaseContentType(normalizedValue));
}

export function detectContentTypeFromExtension(filename) {
  if (typeof filename !== 'string' || !filename.trim()) {
    return '';
  }

  const extension = extname(filename).toLowerCase();
  if (!extension) {
    return '';
  }

  const mappedType = EXTENSION_CONTENT_TYPES.get(extension);
  if (!mappedType) {
    return '';
  }

  if (TEXT_UTF8_EXTENSIONS.has(extension)) {
    return ensureUtf8CharsetForTextContentType(mappedType);
  }

  return mappedType;
}

function startsWithBytes(buffer, bytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length < bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => buffer[index] === byte);
}

function hasAsciiAt(buffer, start, text) {
  if (!Buffer.isBuffer(buffer)) {
    return false;
  }

  return buffer.subarray(start, start + text.length).toString('ascii') === text;
}

export function detectContentTypeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return '';
  }

  if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf';
  }
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (hasAsciiAt(buffer, 0, 'GIF87a') || hasAsciiAt(buffer, 0, 'GIF89a')) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12
    && hasAsciiAt(buffer, 0, 'RIFF')
    && hasAsciiAt(buffer, 8, 'WEBP')
  ) {
    return 'image/webp';
  }
  if (startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return 'application/zip';
  }

  return '';
}

export async function readFilePrefix(filepath, maxBytes = 4096) {
  if (typeof filepath !== 'string' || !filepath.trim()) {
    return Buffer.alloc(0);
  }

  const fileHandle = await open(filepath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await fileHandle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

export async function detectContentTypeFromFile({ prefixBuffer, filepath } = {}) {
  if (Buffer.isBuffer(prefixBuffer)) {
    return detectContentTypeFromBuffer(prefixBuffer);
  }

  if (typeof filepath !== 'string' || !filepath.trim()) {
    return '';
  }

  const buffer = await readFilePrefix(filepath);
  return detectContentTypeFromBuffer(buffer);
}

export async function resolveUploadedFileContentType({
  clientContentType,
  originalFilename,
  prefixBuffer,
  filepath,
} = {}) {
  if (isTrustedClientContentType(clientContentType)) {
    return ensureUtf8CharsetForTextContentType(clientContentType);
  }

  const extensionContentType = detectContentTypeFromExtension(originalFilename);
  if (extensionContentType) {
    return ensureUtf8CharsetForTextContentType(extensionContentType);
  }

  try {
    const detectedContentType = await detectContentTypeFromFile({ prefixBuffer, filepath });
    if (detectedContentType) {
      return ensureUtf8CharsetForTextContentType(detectedContentType);
    }
  } catch {
    // Ignore file sniffing failures and fall back to the default binary type.
  }

  return 'application/octet-stream';
}
