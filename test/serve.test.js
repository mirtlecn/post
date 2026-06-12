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

async function withConfiguredS3(callback) {
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
    return await callback();
  } finally {
    restoreEnvironmentValue('S3_ENDPOINT', previousEnvironment.endpoint);
    restoreEnvironmentValue('S3_ACCESS_KEY_ID', previousEnvironment.accessKeyId);
    restoreEnvironmentValue('S3_SECRET_ACCESS_KEY', previousEnvironment.secretAccessKey);
    restoreEnvironmentValue('S3_BUCKET_NAME', previousEnvironment.bucket);
  }
}

function restoreEnvironmentValue(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

async function withFooterEnv(footerHtml, callback) {
  const previousFooter = process.env.FOOTER;
  process.env.FOOTER = Buffer.from(footerHtml, 'utf8').toString('base64');
  try {
    return await callback();
  } finally {
    restoreEnvironmentValue('FOOTER', previousFooter);
  }
}

function createCachedFileRedis({ path, body, contentType, contentLength }) {
  const metaBytes = Buffer.from(JSON.stringify({ ct: contentType, cl: contentLength }), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(metaBytes.length, 0);
  const payload = Buffer.concat([header, metaBytes, Buffer.from(body)]);
  return {
    withTypeMapping() {
      return this;
    },
    async get(key) {
      const values = {
        [`cache:file:${path}`]: payload,
      };
      return values[key] ?? null;
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

test('resolvePublicRender passes canonical urls from request headers and BASE_DOMAIN', async () => {
  const previousBaseDomain = process.env.BASE_DOMAIN;
  const req = createMockRequest({
    headers: {
      host: 'internal.example',
      'x-forwarded-host': 'public.example',
      'x-forwarded-proto': 'https',
    },
  });

  try {
    delete process.env.BASE_DOMAIN;
    const headerRenderResult = await resolvePublicRender({
      req,
      type: 'md',
      content: '# Hello',
      title: 'Greeting',
      path: 'note',
      redis: createTopicRedis(),
    });

    assert.match(headerRenderResult.renderedContent, /<link rel="canonical" href="https:\/\/public\.example\/note">/);
    assert.match(headerRenderResult.renderedContent, /<meta property="og:url" content="https:\/\/public\.example\/note">/);

    process.env.BASE_DOMAIN = 'https://www.example.com/base';
    const baseDomainRenderResult = await resolvePublicRender({
      req,
      type: 'md',
      content: '# Hello',
      title: 'Greeting',
      path: 'note',
      redis: createTopicRedis(),
    });

    assert.match(baseDomainRenderResult.renderedContent, /<link rel="canonical" href="https:\/\/www\.example\.com\/note">/);
    assert.match(baseDomainRenderResult.renderedContent, /<meta property="og:url" content="https:\/\/www\.example\.com\/note">/);
  } finally {
    restoreEnvironmentValue('BASE_DOMAIN', previousBaseDomain);
  }
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

test('respondByType returns raw url content without redirecting', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'url',
    content: 'https://example.com/raw',
    path: 'ref',
    redis: null,
    raw: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'https://example.com/raw');
  assert.equal(response.getHeader('location'), undefined);
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
  assert.equal(response.getHeader('content-length'), Buffer.byteLength('https://example.com/raw'));
});

test('respondByType returns raw markdown content without rendering html', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'md',
    content: '# Hello',
    title: 'Greeting',
    path: 'note',
    redis: createTopicRedis(),
    raw: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '# Hello');
  assert.doesNotMatch(response.body, /<h1/);
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
});

test('respondByType returns raw legacy md2html content without rendering html', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'md2html',
    content: '# Legacy',
    title: 'Legacy',
    path: 'legacy',
    redis: createTopicRedis(),
    raw: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '# Legacy');
  assert.doesNotMatch(response.body, /<h1/);
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
});

test('respondByType returns raw html content as plain text', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'html',
    content: '<p>Hello</p>',
    path: 'note',
    redis: null,
    raw: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '<p>Hello</p>');
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
});

test('respondByType returns raw qrcode source content without generating qr text', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'qrcode',
    content: 'https://example.com',
    path: 'qr',
    redis: null,
    raw: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'https://example.com');
  assert.doesNotMatch(response.body, /Scan this QR code/);
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
});

test('respondByType returns raw file object key without requiring S3', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'file',
    content: 'post/default/object-key.png',
    path: 'image',
    redis: null,
    raw: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'post/default/object-key.png');
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
});

test('respondByType returns raw topic markdown without rendering html', async () => {
  const response = createMockResponse();
  const topicMarkdown = [
    '<div style="font-size: 1.3em; font-weight: bold">Topic</div>',
    '\n\n',
    '<span style="color: #666;">Home</span>',
  ].join('\n');

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'topic',
    content: topicMarkdown,
    title: 'Topic',
    path: 'topic',
    redis: null,
    raw: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, topicMarkdown);
  assert.doesNotMatch(response.body, /<title>Topic<\/title>/);
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
  assert.equal(response.getHeader('cache-control'), 'public, max-age=600, s-maxage=600');
});

test('respondByType omits body for head raw responses with exact content length', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'html',
    content: '<p>Hello</p>',
    path: 'note',
    redis: null,
    raw: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
  assert.equal(response.getHeader('content-length'), Buffer.byteLength('<p>Hello</p>'));
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
  const topicMarkdown = '<div style="font-size: 1.3em; font-weight: bold">Topic</div>\n\n<span style="color: #666;">Home</span>';

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'topic',
    content: topicMarkdown,
    title: 'Topic',
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
  const topicMarkdown = [
    '<div style="font-size: 1.3em; font-weight: bold">Topic</div>',
    '\n\n',
    '<span style="color: #666;">Home</span>',
    '\n\n\n\n\n\n',
    '- [Entry](</topic/entry>) · 2026-06-11',
  ].join('\n');

  await respondByType(createMockRequest({ method: 'GET' }), response, {
    type: 'topic',
    content: topicMarkdown,
    title: 'Topic',
    path: 'topic',
    redis: null,
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<title>Topic<\/title>/);
  assert.match(response.body, /<div style="font-size: 1.3em; font-weight: bold">Topic<\/div>/);
  assert.match(response.body, /<span style="color: #666;">Home<\/span>/);
  assert.match(response.body, /href="\/topic\/entry"/);
  assert.equal(response.getHeader('cache-control'), 'public, max-age=600, s-maxage=600');
  assert.equal(response.getHeader('content-type'), 'text/html; charset=utf-8');
});

test('resolvePublicRender adds footer while rendering topic markdown', async () => {
  const topicMarkdown = [
    '<div style="font-size: 1.3em; font-weight: bold">Topic</div>',
    '\n\n',
    '<span style="color: #666;">Home</span>',
    '\n\n\n\n\n\n',
    '- [Entry](</topic/entry>) · 2026-06-11',
  ].join('\n');

  await withFooterEnv('footer-819be7', async () => {
    const renderResult = await resolvePublicRender({
      type: 'topic',
      content: topicMarkdown,
      title: 'Topic',
      path: 'topic',
      redis: null,
    });

    assert.equal(renderResult.responseKind, 'html');
    assert.match(renderResult.renderedContent, /<title>Topic<\/title>/);
    assert.match(renderResult.renderedContent, /href="\/topic\/entry"/);
    assert.match(renderResult.renderedContent, /<footer class="markdown-body post-footer">\nfooter-819be7\n<\/footer>/);
    assert.doesNotMatch(topicMarkdown, /footer-819be7/);
  });
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
  await withConfiguredS3(async () => {
    const redis = createCachedFileRedis({
      path: 'docs/file.bin',
      body: 'cached',
      contentType: 'application/octet-stream',
      contentLength: 6,
    });

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
  });
});

test('respondByType adds utf-8 charset for head cached text file responses', async () => {
  const response = createMockResponse();
  await withConfiguredS3(async () => {
    const redis = createCachedFileRedis({
      path: 'scripts/deploy.sh',
      body: 'echo deploy\n',
      contentType: 'application/x-sh',
      contentLength: 12,
    });

    await respondByType(createMockRequest({ method: 'HEAD' }), response, {
      type: 'file',
      content: 'object-key',
      path: 'scripts/deploy.sh',
      redis,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, '');
    assert.equal(response.getHeader('content-type'), 'application/x-sh; charset=utf-8');
    assert.equal(response.getHeader('content-length'), 12);
  });
});

test('respondByType adds utf-8 charset for get cached text file responses', async () => {
  const response = createMockResponse();
  await withConfiguredS3(async () => {
    const redis = createCachedFileRedis({
      path: 'scripts/deploy.sh',
      body: 'echo deploy\n',
      contentType: 'application/x-sh',
      contentLength: 12,
    });

    await respondByType(createMockRequest({ method: 'GET' }), response, {
      type: 'file',
      content: 'object-key',
      path: 'scripts/deploy.sh',
      redis,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.getHeader('content-type'), 'application/x-sh; charset=utf-8');
    assert.equal(response.getHeader('content-length'), 12);
    assert.equal(response.body.toString('utf8'), 'echo deploy\n');
  });
});
