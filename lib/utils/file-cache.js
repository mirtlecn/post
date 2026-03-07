import { createHash } from 'crypto';

const FILE_CACHE_TTL_SECONDS = 60 * 60;

function getMaxCacheBytes() {
  const maxKb = parseInt(process.env.MAX_CONTENT_SIZE_KB, 10) || 500;
  return maxKb * 1024;
}

function fileCacheKey(path) {
  return `cache:file:${path}`;
}

function metaCacheKey(path) {
  return `cache:filemeta:${path}`;
}

export function getCacheTtlSeconds() {
  return FILE_CACHE_TTL_SECONDS;
}

export function getCacheMaxBytes() {
  return getMaxCacheBytes();
}

export async function getFileCache(redis, path) {
  const [body, metaRaw] = await redis.mGet([fileCacheKey(path), metaCacheKey(path)]);
  if (!body || !metaRaw) return null;
  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return null;
  }
  if (!meta || meta.encoding !== 'base64') return null;
  const buffer = Buffer.from(body, 'base64');
  return {
    buffer,
    contentType: meta.contentType,
    contentLength: meta.contentLength || buffer.length,
  };
}

export async function setFileCache(redis, path, { buffer, contentType, contentLength }) {
  const body = buffer.toString('base64');
  const meta = {
    contentType: contentType || 'application/octet-stream',
    contentLength: contentLength || buffer.length,
    encoding: 'base64',
    checksum: createHash('sha1').update(buffer).digest('hex'),
  };
  const ttl = FILE_CACHE_TTL_SECONDS;
  const multi = redis.multi();
  multi.setEx(fileCacheKey(path), ttl, body);
  multi.setEx(metaCacheKey(path), ttl, JSON.stringify(meta));
  await multi.exec();
}

export async function clearFileCache(redis, path) {
  try {
    if (typeof redis.unlink === 'function') {
      await redis.unlink([fileCacheKey(path), metaCacheKey(path)]);
      return;
    }
  } catch {
    // fallback to DEL
  }
  await redis.del([fileCacheKey(path), metaCacheKey(path)]);
}
