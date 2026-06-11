import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequest, readJson, uploadFile } from '../web/src/lib/api.js';

async function withFetchResponse(responseFactory, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => responseFactory();
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('readJson returns null for non-JSON platform responses', async () => {
  const payload = await readJson(new Response('<!doctype html><h1>Function payload too large</h1>', {
    status: 413,
    headers: { 'Content-Type': 'text/html' },
  }));

  assert.equal(payload, null);
});

test('admin upload errors use fallback text for non-JSON platform responses', async () => {
  await withFetchResponse(
    () => new Response('<!doctype html><h1>Function payload too large</h1>', { status: 413 }),
    async () => {
      await assert.rejects(
        uploadFile(new FormData()),
        (error) => {
          assert.equal(error.message, 'Upload failed');
          assert.equal(error.status, 413);
          assert.equal(error.payload, null);
          return true;
        },
      );
    },
  );
});

test('admin request errors keep short JSON error messages', async () => {
  await withFetchResponse(
    () => new Response(JSON.stringify({ error: 'Invalid JSON body', code: 'invalid_request' }), { status: 400 }),
    async () => {
      await assert.rejects(
        createRequest({ method: 'POST' }),
        (error) => {
          assert.equal(error.message, 'Invalid JSON body');
          assert.equal(error.status, 400);
          assert.deepEqual(error.payload, { error: 'Invalid JSON body', code: 'invalid_request' });
          return true;
        },
      );
    },
  );
});

test('admin request errors hide unsafe JSON error messages', async () => {
  const unsafeMessages = [
    '<!doctype html><html><body>Platform warning</body></html>',
    `${'x'.repeat(241)}`,
    'bad\u0000message',
  ];

  for (const unsafeMessage of unsafeMessages) {
    await withFetchResponse(
      () => new Response(JSON.stringify({ error: unsafeMessage }), { status: 500 }),
      async () => {
        await assert.rejects(
          createRequest({ method: 'POST' }),
          (error) => {
            assert.equal(error.message, 'Request failed');
            assert.equal(error.status, 500);
            assert.deepEqual(error.payload, { error: unsafeMessage });
            return true;
          },
        );
      },
    );
  }
});
