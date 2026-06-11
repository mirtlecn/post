import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDirectUploadHandlers } from '../lib/services/create/direct-upload.js';
import { MAX_FILE_SIZE_MB } from '../lib/services/create/validators.js';
import { createMockResponse } from './helpers/http.js';

function createJsonRequest(body) {
  const request = new EventEmitter();
  request.method = 'POST';
  request.url = '/api/admin/upload/prepare';
  request.headers = {
    'content-type': 'application/json',
    host: 'example.com',
  };

  queueMicrotask(() => {
    request.emit('data', Buffer.from(JSON.stringify(body)));
    request.emit('end');
  });

  return request;
}

class FakeRedis {
  constructor() {
    this.values = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async set(key, value) {
    this.values.set(key, value);
  }

  async setEx(key, ttl, value) {
    this.values.set(key, value);
    this.ttls.set(key, ttl);
  }

  async del(key) {
    const keys = Array.isArray(key) ? key : [key];
    let count = 0;
    for (const item of keys) {
      if (this.values.delete(item)) count += 1;
      this.ttls.delete(item);
    }
    return count;
  }
}

class FakeS3 {
  constructor({ configured = true, uuids = [] } = {}) {
    this.configured = configured;
    this.uuids = [...uuids];
    this.objects = new Map();
    this.deleted = [];
    this.putRequests = [];
    this.copyRequests = [];
  }

  isS3Configured() {
    return this.configured;
  }

  generateUUID() {
    return this.uuids.shift() || `uuid-${this.uuids.length}`;
  }

  getSignedUploadUrlTtlSeconds() {
    return 300;
  }

  getObjectKeyPrefix(ttlSeconds) {
    return ttlSeconds > 0 ? 'post/tmp/1day/' : 'post/default/';
  }

  async generatePresignedPutUrl(objectKey, contentType, expiresSeconds) {
    this.putRequests.push({ objectKey, contentType, expiresSeconds });
    return `https://s3.local/${objectKey}`;
  }

  async headObject(objectKey) {
    const object = this.objects.get(objectKey);
    if (!object) {
      const error = new Error('missing object');
      error.name = 'NotFound';
      throw error;
    }
    return object;
  }

  async copyObject(sourceKey, destKey) {
    const object = await this.headObject(sourceKey);
    this.copyRequests.push({ sourceKey, destKey });
    this.objects.set(destKey, { ...object });
  }

  async deleteFileFromS3(objectKey) {
    this.deleted.push(objectKey);
    this.objects.delete(objectKey);
  }
}

function createHandlers({ redis = new FakeRedis(), s3 = new FakeS3() } = {}) {
  return {
    redis,
    s3,
    ...createDirectUploadHandlers({
      getRedisClient: async () => redis,
      s3,
    }),
  };
}

function parseJsonResponse(response) {
  return JSON.parse(String(response.body));
}

test('prepare upload writes pending metadata and returns a presigned PUT request', async () => {
  const { redis, s3, handlePrepareUpload } = createHandlers({
    s3: new FakeS3({ uuids: ['upload-123'] }),
  });
  const response = createMockResponse();

  await handlePrepareUpload(createJsonRequest({
    path: 'photo.png',
    filename: 'photo.png',
    contentType: 'image/png',
    size: 1024,
    title: 'Photo',
  }), response);

  assert.equal(response.statusCode, 200);
  const payload = parseJsonResponse(response);
  assert.equal(payload.uploadId, 'upload-123');
  assert.equal(payload.uploadUrl, 'https://s3.local/post/staging/upload-123.png');
  assert.deepEqual(payload.headers, { 'Content-Type': 'image/png' });
  assert.deepEqual(s3.putRequests, [{
    objectKey: 'post/staging/upload-123.png',
    contentType: 'image/png',
    expiresSeconds: 300,
  }]);

  const pending = JSON.parse(await redis.get('upload:staging:upload-123'));
  assert.equal(pending.stagingKey, 'post/staging/upload-123.png');
  assert.equal(pending.expectedSize, 1024);
  assert.equal(pending.resolvedPath, 'photo.png');
  assert.equal(pending.title, 'Photo');
});

test('prepare upload rejects unconfigured S3', async () => {
  const { handlePrepareUpload } = createHandlers({
    s3: new FakeS3({ configured: false }),
  });
  const response = createMockResponse();

  await handlePrepareUpload(createJsonRequest({
    filename: 'photo.png',
    size: 1024,
  }), response);

  assert.equal(response.statusCode, 501);
  assert.match(response.body, /s3_not_configured/);
});

test('prepare upload validates size, path, and create conflicts', async () => {
  const invalidSize = createHandlers();
  const invalidSizeResponse = createMockResponse();
  await invalidSize.handlePrepareUpload(createJsonRequest({
    filename: 'large.bin',
    size: (MAX_FILE_SIZE_MB * 1024 * 1024) + 1,
  }), invalidSizeResponse);
  assert.equal(invalidSizeResponse.statusCode, 413);

  const invalidPath = createHandlers();
  const invalidPathResponse = createMockResponse();
  await invalidPath.handlePrepareUpload(createJsonRequest({
    path: 'bad path',
    filename: 'photo.png',
    size: 1024,
  }), invalidPathResponse);
  assert.equal(invalidPathResponse.statusCode, 400);

  const conflict = createHandlers();
  await conflict.redis.set('surl:photo.png', '{"type":"text","content":"old"}');
  const conflictResponse = createMockResponse();
  await conflict.handlePrepareUpload(createJsonRequest({
    path: 'photo.png',
    filename: 'photo.png',
    size: 1024,
  }), conflictResponse);
  assert.equal(conflictResponse.statusCode, 409);
  assert.match(conflictResponse.body, /"code":"conflict"/);
});

test('complete upload rejects missing and mismatched staging objects', async () => {
  const missing = createHandlers();
  const missingResponse = createMockResponse();
  await missing.handleCompleteUpload(createJsonRequest({ uploadId: 'missing' }), missingResponse);
  assert.equal(missingResponse.statusCode, 404);

  const mismatch = createHandlers();
  await mismatch.redis.set('upload:staging:upload-123', JSON.stringify({
    uploadId: 'upload-123',
    stagingKey: 'post/staging/upload-123.png',
    expectedSize: 1024,
    contentType: 'image/png',
    requestedPath: 'photo.png',
    normalizedTopic: '',
    title: '',
    ttlValue: 0,
    ttlSeconds: 0,
    created: null,
    createdProvided: false,
    allowOverwrite: false,
    fileExtension: '.png',
    requestReceivedAt: '2026-06-11T00:00:00Z',
  }));
  mismatch.s3.objects.set('post/staging/upload-123.png', {
    contentLength: 2048,
    contentType: 'image/png',
  });
  const mismatchResponse = createMockResponse();

  await mismatch.handleCompleteUpload(createJsonRequest({ uploadId: 'upload-123' }), mismatchResponse);

  assert.equal(mismatchResponse.statusCode, 400);
  assert.match(mismatchResponse.body, /upload_size_mismatch/);
  assert.equal(await mismatch.redis.get('upload:staging:upload-123'), null);
  assert.deepEqual(mismatch.s3.deleted, ['post/staging/upload-123.png']);
});

test('complete upload copies the object, writes file metadata, and clears staging state', async () => {
  const { redis, s3, handlePrepareUpload, handleCompleteUpload } = createHandlers({
    s3: new FakeS3({ uuids: ['upload-123', 'final-456'] }),
  });

  await handlePrepareUpload(createJsonRequest({
    path: 'photo.png',
    filename: 'photo.png',
    contentType: 'image/png',
    size: 1024,
    title: 'Photo',
    ttl: 0,
  }), createMockResponse());
  s3.objects.set('post/staging/upload-123.png', {
    contentLength: 1024,
    contentType: 'image/png',
  });

  const response = createMockResponse();
  await handleCompleteUpload(createJsonRequest({ uploadId: 'upload-123' }), response);

  assert.equal(response.statusCode, 201);
  const payload = parseJsonResponse(response);
  assert.equal(payload.path, 'photo.png');
  assert.equal(payload.type, 'file');
  assert.equal(payload.content, 'post/default/final-456.png');
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'metadata'), false);

  const stored = JSON.parse(await redis.get('surl:photo.png'));
  assert.deepEqual(stored.metadata, {
    contentLength: 1024,
    contentType: 'image/png',
  });
  assert.deepEqual(s3.copyRequests, [{
    sourceKey: 'post/staging/upload-123.png',
    destKey: 'post/default/final-456.png',
  }]);
  assert.equal(await redis.get('upload:staging:upload-123'), null);
  assert.deepEqual(s3.deleted, ['post/staging/upload-123.png']);
});
