import { RESP_TYPES } from 'redis';

const FILE_CACHE_TTL_SECONDS = 60 * 60;
const FILE_CACHE_HEADER_BYTES = 4;

function getMaxCacheBytes() {
  const maxKb = parseInt(process.env.MAX_CONTENT_SIZE_KB, 10) || 1024;
  return maxKb * 1024;
}

function fileCacheKey(path) {
  return `cache:file:${path}`;
}

export function getCacheTtlSeconds() {
  return FILE_CACHE_TTL_SECONDS;
}

export function getCacheMaxBytes() {
  return getMaxCacheBytes();
}

function encodeFileCachePayload({ buffer, contentType, contentLength }) {
  const meta = {
    ct: contentType || 'application/octet-stream',
    cl: contentLength ?? buffer.length,
  };
  const metaBytes = Buffer.from(JSON.stringify(meta), 'utf8');
  const header = Buffer.alloc(FILE_CACHE_HEADER_BYTES);
  header.writeUInt32BE(metaBytes.length, 0);
  return Buffer.concat([header, metaBytes, buffer]);
}

function decodeFileCachePayload(payload) {
  if (!Buffer.isBuffer(payload) || payload.length < FILE_CACHE_HEADER_BYTES) {
    return null;
  }
  const metaLength = payload.readUInt32BE(0);
  if (metaLength > payload.length - FILE_CACHE_HEADER_BYTES) {
    return null;
  }
  let meta;
  try {
    const metaStart = FILE_CACHE_HEADER_BYTES;
    const metaEnd = metaStart + metaLength;
    meta = JSON.parse(payload.subarray(metaStart, metaEnd).toString('utf8'));
  } catch {
    return null;
  }
  if (
    !meta ||
    typeof meta.ct !== 'string' ||
    !Number.isSafeInteger(meta.cl) ||
    meta.cl < 0
  ) {
    return null;
  }
  const bodyStart = FILE_CACHE_HEADER_BYTES + metaLength;
  return {
    buffer: payload.subarray(bodyStart),
    contentType: meta.ct,
    contentLength: meta.cl,
  };
}

export async function getFileCache(redis, path) {
  const client = typeof redis.withTypeMapping === 'function'
    ? redis.withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer })
    : redis;
  const payload = await client.get(fileCacheKey(path));
  return decodeFileCachePayload(payload);
}

export async function setFileCache(redis, path, { buffer, contentType, contentLength }) {
  await redis.setEx(
    fileCacheKey(path),
    FILE_CACHE_TTL_SECONDS,
    encodeFileCachePayload({ buffer, contentType, contentLength }),
  );
}

export async function clearFileCache(redis, path) {
  const key = fileCacheKey(path);
  try {
    if (typeof redis.unlink === 'function') {
      await redis.unlink([key]);
      return;
    }
  } catch {
    // fallback to DEL
  }
  await redis.del([key]);
}
