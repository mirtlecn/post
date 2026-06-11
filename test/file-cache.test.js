import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearFileCache,
  getCacheTtlSeconds,
  getFileCache,
  setFileCache,
} from '../lib/utils/file-cache.js';

class FakeRedis {
  constructor() {
    this.values = new Map();
    this.unlinkShouldFail = false;
  }

  withTypeMapping() {
    return this;
  }

  async get(key) {
    return this.values.get(key)?.value ?? null;
  }

  async setEx(key, ttl, value) {
    this.values.set(key, { ttl, value });
  }

  async unlink(keys) {
    if (this.unlinkShouldFail) {
      throw new Error('unlink failed');
    }
    for (const key of keys) {
      this.values.delete(key);
    }
  }

  async del(keys) {
    for (const key of keys) {
      this.values.delete(key);
    }
  }
}

function parsePayload(payload) {
  const metaLength = payload.readUInt32BE(0);
  const metaStart = 4;
  const metaEnd = metaStart + metaLength;
  return {
    meta: JSON.parse(payload.subarray(metaStart, metaEnd).toString('utf8')),
    body: payload.subarray(metaEnd),
  };
}

test('setFileCache writes a single binary key with a 1 hour ttl', async () => {
  const redis = new FakeRedis();
  const buffer = Buffer.from([0, 1, 2, 253, 254, 255]);

  await setFileCache(redis, 'docs/file.bin', {
    buffer,
    contentType: 'application/octet-stream',
    contentLength: buffer.length,
  });

  const cacheEntry = redis.values.get('cache:file:docs/file.bin');

  assert.equal(redis.values.size, 1);
  assert.equal(cacheEntry.ttl, getCacheTtlSeconds());
  assert.equal(Buffer.isBuffer(cacheEntry.value), true);

  const { meta, body } = parsePayload(cacheEntry.value);
  assert.deepEqual(meta, { ct: 'application/octet-stream', cl: buffer.length });
  assert.deepEqual(body, buffer);
});

test('getFileCache restores cached file payload', async () => {
  const redis = new FakeRedis();
  const buffer = Buffer.from([0, 255, 1, 254]);

  await setFileCache(redis, 'docs/file.bin', {
    buffer,
    contentType: 'text/plain',
    contentLength: buffer.length,
  });

  const cached = await getFileCache(redis, 'docs/file.bin');

  assert.deepEqual(cached, {
    buffer,
    contentType: 'text/plain',
    contentLength: buffer.length,
  });
});

test('getFileCache returns null for corrupt binary payloads', async () => {
  const redis = new FakeRedis();

  redis.values.set('cache:file:short.bin', {
    ttl: getCacheTtlSeconds(),
    value: Buffer.from([0, 1, 2]),
  });
  assert.equal(await getFileCache(redis, 'short.bin'), null);

  const oversizedMeta = Buffer.alloc(4);
  oversizedMeta.writeUInt32BE(10, 0);
  redis.values.set('cache:file:bad-length.bin', {
    ttl: getCacheTtlSeconds(),
    value: oversizedMeta,
  });
  assert.equal(await getFileCache(redis, 'bad-length.bin'), null);

  const invalidJsonHeader = Buffer.alloc(4);
  const invalidJsonMeta = Buffer.from('{bad', 'utf8');
  invalidJsonHeader.writeUInt32BE(invalidJsonMeta.length, 0);
  redis.values.set('cache:file:bad-json.bin', {
    ttl: getCacheTtlSeconds(),
    value: Buffer.concat([invalidJsonHeader, invalidJsonMeta, Buffer.from('body')]),
  });
  assert.equal(await getFileCache(redis, 'bad-json.bin'), null);

  const invalidMetaHeader = Buffer.alloc(4);
  const invalidMeta = Buffer.from(JSON.stringify({ ct: 'text/plain', cl: '4' }), 'utf8');
  invalidMetaHeader.writeUInt32BE(invalidMeta.length, 0);
  redis.values.set('cache:file:bad-meta.bin', {
    ttl: getCacheTtlSeconds(),
    value: Buffer.concat([invalidMetaHeader, invalidMeta, Buffer.from('body')]),
  });
  assert.equal(await getFileCache(redis, 'bad-meta.bin'), null);
});

test('clearFileCache falls back to DEL when UNLINK fails', async () => {
  const redis = new FakeRedis();
  redis.unlinkShouldFail = true;
  redis.values.set('cache:file:docs/file.bin', { ttl: 3600, value: Buffer.from('body') });

  await clearFileCache(redis, 'docs/file.bin');

  assert.equal(redis.values.has('cache:file:docs/file.bin'), false);
});
