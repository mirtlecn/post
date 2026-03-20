import test from 'node:test';
import assert from 'node:assert/strict';
import { respondByType, resolvePublicRender } from '../lib/utils/serve.js';
import { createMockRequest, createMockResponse } from './helpers/http.js';

function createTopicRedis() {
  const values = new Map();

  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async mGet(keys) {
      return keys.map((key) => values.get(key) ?? null);
    },
    set(key, value) {
      values.set(key, value);
    },
  };
}

test('respondByType omits body for head text responses', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'text',
    content: 'hello',
    path: 'note',
    redis: null,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
  assert.equal(response.getHeader('content-length'), 6);
});

test('resolvePublicRender renders markdown as html for regular entries', async () => {
  const renderResult = await resolvePublicRender({
    type: 'md',
    content: '# Hello',
    title: 'Greeting',
    path: 'note',
    redis: createTopicRedis(),
  });

  assert.equal(renderResult.responseKind, 'html');
  assert.equal(renderResult.contentType, 'text/html; charset=utf-8');
  assert.match(renderResult.renderedContent, /<title>Greeting<\/title>/);
  assert.match(renderResult.renderedContent, /<h1 id="hello">Hello<\/h1>/);
});

test('resolvePublicRender renders topic markdown with a backlink', async () => {
  const redis = createTopicRedis();
  redis.set('surl:notes', '{"type":"topic","content":"<article></article>","title":"Notes"}');

  const renderResult = await resolvePublicRender({
    type: 'md',
    content: '# Entry',
    title: 'Nested',
    path: 'notes/entry',
    redis,
  });

  assert.match(renderResult.renderedContent, /href="\/notes"/);
  assert.match(renderResult.renderedContent, /<a href="\/notes"><strong>Home<\/strong><\/a>/);
  assert.match(renderResult.renderedContent, /Notes/);
});

test('resolvePublicRender renders qrcode content on demand', async () => {
  const renderResult = await resolvePublicRender({
    type: 'qrcode',
    content: 'https://example.com',
    path: 'qr',
    redis: null,
  });

  assert.equal(renderResult.responseKind, 'text');
  assert.match(renderResult.renderedContent, /Scan this QR code/);
});

test('respondByType omits body for head html responses', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'html',
    content: '<p>Hello</p>',
    path: 'note',
    redis: null,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.getHeader('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.getHeader('content-length'), Buffer.byteLength('<p>Hello</p>'));
});

test('respondByType omits body for head markdown responses using rendered html length', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'md',
    title: 'Greeting',
    content: '# Hello',
    path: 'note',
    redis: createTopicRedis(),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.getHeader('content-type'), 'text/html; charset=utf-8');
  assert.ok(response.getHeader('content-length') > Buffer.byteLength('# Hello'));
});

test('respondByType omits body for head qrcode responses using rendered text length', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'qrcode',
    content: 'hello',
    path: 'qr',
    redis: null,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
  assert.ok(response.getHeader('content-length') > Buffer.byteLength('hello'));
});

test('respondByType omits body for head topic responses', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'topic',
    content: '<article>Topic</article>',
    path: 'topic',
    redis: null,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.getHeader('cache-control'), 'public, max-age=600, s-maxage=600');
  assert.equal(response.getHeader('content-type'), 'text/html; charset=utf-8');
});

test('respondByType serves topic responses with 10 minute cache headers', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'topic',
    content: '<article>Topic</article>',
    path: 'topic',
    redis: null,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '<article>Topic</article>');
  assert.equal(response.getHeader('cache-control'), 'public, max-age=600, s-maxage=600');
  assert.equal(response.getHeader('content-type'), 'text/html; charset=utf-8');
});

test('respondByType returns 500 when dynamic rendering fails', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'qrcode',
    content: 'x'.repeat(251),
    path: 'qr',
    redis: null,
  });

  assert.equal(response.statusCode, 500);
  assert.match(response.body, /"code":"internal"/);
});

test('respondByType omits body for head cached file responses', async () => {
  const response = createMockResponse();
  const previousEnvironment = {
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    bucket: process.env.S3_BUCKET_NAME,
  };
  process.env.S3_ENDPOINT = 'http://s3.local';
  process.env.S3_ACCESS_KEY_ID = 'test-key';
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
  process.env.S3_BUCKET_NAME = 'test-bucket';
  try {
    const redis = {
      async mGet(keys) {
        const values = {
          'cache:file:docs/file.bin': Buffer.from('cached').toString('base64'),
          'cache:filemeta:docs/file.bin': JSON.stringify({
            contentType: 'application/octet-stream',
            contentLength: 6,
            encoding: 'base64',
          }),
        };
        return keys.map((key) => values[key] ?? null);
      },
    };

    await respondByType(createMockRequest({ method: 'HEAD' }), response, {
      type: 'file',
      content: 'object-key',
      path: 'docs/file.bin',
      redis,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, '');
    assert.equal(response.getHeader('content-type'), 'application/octet-stream');
    assert.equal(response.getHeader('content-length'), 6);
  } finally {
    process.env.S3_ENDPOINT = previousEnvironment.endpoint;
    process.env.S3_ACCESS_KEY_ID = previousEnvironment.accessKeyId;
    process.env.S3_SECRET_ACCESS_KEY = previousEnvironment.secretAccessKey;
    process.env.S3_BUCKET_NAME = previousEnvironment.bucket;
  }
});
