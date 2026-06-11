import test from 'node:test';
import assert from 'node:assert/strict';
import adminHandler from '../api/admin.js';
import adminUploadCompleteHandler from '../api/admin/upload/complete.js';
import adminUploadPrepareHandler from '../api/admin/upload/prepare.js';
import { createApiHandler } from '../api/index.js';
import { createAdminApiHandler } from '../api/admin.js';
import { ADMIN_ACTIONS, createActionApiHandler } from '../lib/handlers/action-router.js';
import { createMockRequest, createMockResponse } from './helpers/http.js';

test('createApiHandler rejects unauthenticated action requests', async () => {
  const handler = createApiHandler({
    authenticate: () => false,
    onPublicGet: async () => {
      throw new Error('public handler should not run');
    },
  });
  const response = createMockResponse();

  await handler(createMockRequest({ method: 'POST', url: '/create' }), response);

  assert.equal(response.statusCode, 401);
  assert.match(response.body, /Unauthorized/);
});

test('createApiHandler routes POST action paths', async () => {
  const calls = [];
  const handler = createApiHandler({
    authenticate: () => true,
    onCreate: async () => {
      calls.push('create');
    },
    onReplace: async () => {
      calls.push('replace');
    },
    onDelete: async () => {
      calls.push('delete');
    },
    onLookup: async () => {
      calls.push('lookup');
      return true;
    },
  });

  await handler(createMockRequest({ method: 'POST', url: '/create' }), createMockResponse());
  await handler(createMockRequest({ method: 'POST', url: '/update' }), createMockResponse());
  await handler(createMockRequest({ method: 'POST', url: '/delete' }), createMockResponse());
  await handler(createMockRequest({ method: 'POST', url: '/query' }), createMockResponse());

  assert.deepEqual(calls, ['create', 'replace', 'delete', 'lookup']);
});

test('createApiHandler query action falls back to list when lookup does not handle', async () => {
  const calls = [];
  const handler = createApiHandler({
    authenticate: () => true,
    onLookup: async () => {
      calls.push('lookup');
      return false;
    },
    onList: async () => {
      calls.push('list');
    },
  });

  await handler(createMockRequest({ method: 'POST', url: '/query' }), createMockResponse());
  assert.deepEqual(calls, ['lookup', 'list']);
});

test('createApiHandler routes GET to public handler even when authenticated', async () => {
  const calls = [];
  const handler = createApiHandler({
    authenticate: () => true,
    onLookup: async () => {
      calls.push('lookup');
      return true;
    },
    onPublicGet: async () => {
      calls.push('public');
    },
  });

  await handler(createMockRequest({ method: 'GET', url: '/query' }), createMockResponse());
  assert.deepEqual(calls, ['public']);
});

test('createApiHandler routes head requests to public handler', async () => {
  const calls = [];
  const handler = createApiHandler({
    onPublicGet: async () => {
      calls.push('public');
    },
  });

  await handler(createMockRequest({ method: 'HEAD' }), createMockResponse());
  assert.deepEqual(calls, ['public']);
});

test('createApiHandler disables legacy root management methods', async () => {
  const calls = [];
  const handler = createApiHandler({
    authenticate: () => true,
    onCreate: async () => calls.push('create'),
    onReplace: async () => calls.push('replace'),
    onDelete: async () => calls.push('delete'),
  });

  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = createMockResponse();
    await handler(createMockRequest({ method, url: '/' }), response);
    assert.equal(response.statusCode, 405);
  }

  assert.deepEqual(calls, []);
});

test('createApiHandler rejects non-action POST paths without public fallback', async () => {
  const calls = [];
  const handler = createApiHandler({
    authenticate: () => true,
    onCreate: async () => calls.push('create'),
    onPublicGet: async () => calls.push('public'),
  });
  const response = createMockResponse();

  await handler(createMockRequest({ method: 'POST', url: '/not-an-action' }), response);

  assert.equal(response.statusCode, 405);
  assert.deepEqual(calls, []);
});

test('createApiHandler keeps direct upload paths out of the token API', async () => {
  const calls = [];
  const handler = createApiHandler({
    authenticate: () => true,
    onCreate: async () => calls.push('create'),
  });
  const response = createMockResponse();

  await handler(createMockRequest({ method: 'POST', url: '/upload/prepare' }), response);

  assert.equal(response.statusCode, 405);
  assert.deepEqual(calls, []);
});

test('admin action router routes direct upload actions with the admin action set', async () => {
  const calls = [];
  const handler = createActionApiHandler({
    basePath: '/api/admin',
    actions: ADMIN_ACTIONS,
    authenticate: async () => true,
    onPrepareUpload: async () => calls.push('prepare'),
    onCompleteUpload: async () => calls.push('complete'),
  });

  await handler(createMockRequest({ method: 'POST', url: '/api/admin/upload/prepare' }), createMockResponse());
  await handler(createMockRequest({ method: 'POST', url: '/api/admin/upload/complete' }), createMockResponse());

  assert.deepEqual(calls, ['prepare', 'complete']);
});

test('createAdminApiHandler rejects legacy admin root data endpoint', async () => {
  const handler = createAdminApiHandler({
    authenticate: async () => true,
  });
  const response = createMockResponse();

  await handler(createMockRequest({ method: 'POST', url: '/api/admin' }), response);

  assert.equal(response.statusCode, 405);
});

test('createAdminApiHandler routes admin direct upload actions', async () => {
  const calls = [];
  const apiHandler = createAdminApiHandler({
    authenticate: async () => true,
    apiHandler: async (req, res) => {
      calls.push([req.method, req.url, req.headers.authorization]);
      res.status(200).send('{}');
    },
  });
  const response = createMockResponse();

  await apiHandler(createMockRequest({ method: 'POST', url: '/api/admin/upload/prepare' }), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [['POST', '/api/admin/upload/prepare', `Bearer ${process.env.SECRET_KEY}`]]);
});

test('vercel admin upload route files reuse the admin handler', () => {
  assert.equal(adminUploadPrepareHandler, adminHandler);
  assert.equal(adminUploadCompleteHandler, adminHandler);
});
