import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteRequest, prepareUpload, uploadToS3 } from '../web/src/lib/api.js';

async function withMockFetch(mockFetch, callback) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await callback();
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test('requestJson uses fallback text for non-JSON error responses', async () => {
  await withMockFetch(async () => new Response('<html>platform error</html>', {
    status: 500,
    headers: { 'Content-Type': 'text/html' },
  }), async () => {
    await assert.rejects(
      () => deleteRequest(),
      (error) => {
        assert.equal(error.message, 'Request failed');
        assert.equal(error.status, 500);
        assert.equal(error.payload, null);
        return true;
      },
    );
  });
});

test('requestJson preserves JSON error messages', async () => {
  await withMockFetch(async () => new Response(JSON.stringify({
    error: 'path "photo.png" already exists',
    code: 'conflict',
  }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  }), async () => {
    await assert.rejects(
      () => prepareUpload({ path: 'photo.png' }),
      (error) => {
        assert.equal(error.message, 'path "photo.png" already exists');
        assert.equal(error.status, 409);
        assert.equal(error.payload.code, 'conflict');
        return true;
      },
    );
  });
});

test('requestJson uses fallback text for network failures', async () => {
  await withMockFetch(async () => {
    throw new TypeError('Failed to fetch');
  }, async () => {
    await assert.rejects(
      () => deleteRequest(),
      (error) => {
        assert.equal(error.message, 'Request failed');
        assert.equal(error.status, 0);
        assert.equal(error.payload, null);
        return true;
      },
    );
  });
});

test('uploadToS3 sends the raw file without credentials', async () => {
  const file = new Blob(['body'], { type: 'text/plain' });
  let captured;
  await withMockFetch(async (url, init) => {
    captured = { url, init };
    return new Response('', { status: 200 });
  }, async () => {
    await uploadToS3('https://s3.local/upload', { 'Content-Type': 'text/plain' }, file);
  });

  assert.equal(captured.url, 'https://s3.local/upload');
  assert.equal(captured.init.method, 'PUT');
  assert.equal(captured.init.credentials, 'omit');
  assert.equal(captured.init.body, file);
  assert.deepEqual(captured.init.headers, { 'Content-Type': 'text/plain' });
});

test('uploadToS3 uses fallback text for network failures', async () => {
  await withMockFetch(async () => {
    throw new TypeError('Failed to fetch');
  }, async () => {
    await assert.rejects(
      () => uploadToS3('https://s3.local/upload', {}, new Blob(['body'])),
      (error) => {
        assert.equal(error.message, 'Upload failed');
        assert.equal(error.status, 0);
        assert.equal(error.payload, null);
        return true;
      },
    );
  });
});
