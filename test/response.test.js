import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { proxyStreamWithCache } from '../lib/utils/response.js';
import { FetchNodeResponse } from '../lib/server/fetch-node-adapter.js';

function delayedStream(chunks) {
  let index = 0;
  return new Readable({
    read() {
      if (index >= chunks.length) {
        this.push(null);
        return;
      }
      const chunk = chunks[index];
      index += 1;
      setTimeout(() => {
        this.push(chunk);
      }, 5);
    },
  });
}

test('proxyStreamWithCache waits for uncached streams before fetch response conversion', async () => {
  const response = new FetchNodeResponse();
  const body = delayedStream([
    Buffer.from('large '),
    Buffer.from('file body'),
  ]);

  await proxyStreamWithCache(response, {
    body,
    contentType: 'application/octet-stream',
    contentLength: 1000,
  }, {
    maxBytes: 10,
    writeCache: async () => {
      throw new Error('large files must not be cached');
    },
  });

  const fetchResponse = await response.toFetchResponse({ method: 'GET' });
  const buffer = Buffer.from(await fetchResponse.arrayBuffer());

  assert.equal(fetchResponse.status, 200);
  assert.equal(fetchResponse.headers.get('content-type'), 'application/octet-stream');
  assert.equal(fetchResponse.headers.get('content-length'), '1000');
  assert.equal(buffer.toString('utf8'), 'large file body');
});
