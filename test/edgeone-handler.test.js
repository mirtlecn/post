import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminApiHandler } from '../api/admin.js';
import { createApiHandler } from '../api/index.js';
import { createEdgeOneRequestHandler } from '../cloud-functions/post-handler.js';
import { createFetchNodeAdapters } from '../lib/server/fetch-node-adapter.js';
import { jsonResponse } from '../lib/utils/response.js';
import { getDomain, parseRequestBodyWithLimit } from '../lib/utils/storage.js';

test('fetch node adapter sends json requests through existing api handlers', async () => {
  const request = new Request('https://post.example/api?debug=1', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ hello: 'edgeone' }),
  });
  const { req, res } = await createFetchNodeAdapters(request);
  const handler = createApiHandler({
    authenticate: () => true,
    onCreate: async (requestLike, responseLike) => {
      const body = await parseRequestBodyWithLimit(requestLike);
      return jsonResponse(responseLike, {
        body,
        url: requestLike.url,
        host: requestLike.headers.host,
      }, 201);
    },
  });

  await handler(req, res);
  const response = await res.toFetchResponse({ method: req.method });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.deepEqual(payload.body, { hello: 'edgeone' });
  assert.equal(payload.url, '/api?debug=1');
  assert.equal(payload.host, 'post.example');
});

test('fetch node adapter keeps admin request wrappers body-readable', async () => {
  process.env.SECRET_KEY = 'edge-secret';
  const request = new Request('https://post.example/api/admin', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ path: 'admin-note', url: 'hello' }),
  });
  const { req, res } = await createFetchNodeAdapters(request);
  const handler = createAdminApiHandler({
    authenticate: () => true,
    apiHandler: async (requestLike, responseLike) => {
      const body = await parseRequestBodyWithLimit(requestLike);
      return jsonResponse(responseLike, {
        authorization: requestLike.headers.authorization,
        body,
      }, 200);
    },
  });

  await handler(req, res);
  const response = await res.toFetchResponse({ method: req.method });
  const payload = await response.json();

  assert.equal(payload.authorization, 'Bearer edge-secret');
  assert.deepEqual(payload.body, { path: 'admin-note', url: 'hello' });
});

test('fetch node adapter preserves status, headers, and set-cookie', async () => {
  const request = new Request('https://post.example/api/admin/session', { method: 'POST' });
  const { req, res } = await createFetchNodeAdapters(request);

  res.status(202);
  res.setHeader('Set-Cookie', 'post_admin_session=session-123; Path=/api/admin; HttpOnly');
  res.setHeader('X-Test-Header', 'edgeone');
  res.send('ok');

  const response = await res.toFetchResponse({ method: req.method });

  assert.equal(response.status, 202);
  assert.equal(response.headers.get('set-cookie'), 'post_admin_session=session-123; Path=/api/admin; HttpOnly');
  assert.equal(response.headers.get('x-test-header'), 'edgeone');
  assert.equal(await response.text(), 'ok');
});

test('edgeone handler routes admin session, admin api, and public paths', async () => {
  const calls = [];
  const handler = createEdgeOneRequestHandler({
    loadHandlers: async () => ({
      handleRoot: async (req, res) => {
        calls.push(['root', req.url]);
        res.status(200).send('root');
      },
      handleAdmin: async (req, res) => {
        calls.push(['admin', req.url]);
        res.status(200).send('admin');
      },
      handleAdminSession: async (req, res) => {
        calls.push(['session', req.url]);
        res.status(200).send('session');
      },
    }),
  });

  const sessionResponse = await handler({
    env: { SECRET_KEY: 'edge-secret' },
    request: new Request('https://post.example/api/admin/session', { method: 'GET' }),
  });
  const adminResponse = await handler({
    request: new Request('https://post.example/api/admin', { method: 'GET' }),
  });
  const rootResponse = await handler({
    request: new Request('https://post.example/topic/item?export=1', { method: 'GET' }),
  });

  assert.equal(process.env.SECRET_KEY, 'edge-secret');
  assert.equal(await sessionResponse.text(), 'session');
  assert.equal(await adminResponse.text(), 'admin');
  assert.equal(await rootResponse.text(), 'root');
  assert.deepEqual(calls, [
    ['session', '/api/admin/session'],
    ['admin', '/api/admin'],
    ['root', '/topic/item?export=1'],
  ]);
});

test('edgeone handler syncs BASE_DOMAIN and disables unsafe cache', async () => {
  const previousBaseDomain = process.env.BASE_DOMAIN;
  const handler = createEdgeOneRequestHandler({
    loadHandlers: async () => ({
      handleRoot: async (req, res) => {
        jsonResponse(res, { domain: getDomain(req) }, 200);
      },
      handleAdmin: async (req, res) => {
        jsonResponse(res, { domain: getDomain(req) }, 200);
      },
      handleAdminSession: async (req, res) => {
        jsonResponse(res, { domain: getDomain(req) }, 200);
      },
    }),
  });

  try {
    const response = await handler({
      env: { BASE_DOMAIN: 'https://www.mirtle.cn/' },
      request: new Request('http://pages-pro-8-9c1c.pages-scf-gz-pro.qcloudteo.com/?debug=1', {
        headers: {
          host: 'pages-pro-8-9c1c.pages-scf-gz-pro.qcloudteo.com',
        },
      }),
    });
    const payload = await response.json();

    assert.equal(payload.domain, 'https://www.mirtle.cn');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    if (previousBaseDomain === undefined) {
      delete process.env.BASE_DOMAIN;
    } else {
      process.env.BASE_DOMAIN = previousBaseDomain;
    }
  }
});
