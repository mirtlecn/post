import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldForcePathStyle } from '../lib/utils/s3.js';

test('shouldForcePathStyle defaults to true for configured custom endpoints', () => {
  assert.equal(shouldForcePathStyle('http://minio.internal:9000', undefined), true);
});

test('shouldForcePathStyle respects explicit false flag', () => {
  assert.equal(shouldForcePathStyle('http://minio.internal:9000', 'false'), false);
  assert.equal(shouldForcePathStyle('http://minio.internal:9000', '0'), false);
});

test('shouldForcePathStyle respects explicit true flag', () => {
  assert.equal(shouldForcePathStyle('http://minio.internal:9000', 'true'), true);
  assert.equal(shouldForcePathStyle('http://minio.internal:9000', '1'), true);
});

test('shouldForcePathStyle stays false when endpoint is missing', () => {
  assert.equal(shouldForcePathStyle('', undefined), false);
});
