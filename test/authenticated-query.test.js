import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchedPaths,
  listAuthenticatedItems,
  parseTrailingWildcardPath,
} from '../lib/handlers/authenticated-query.js';

function createFakeRedis({
  storedValues = {},
  ttlValues = {},
  topicSizes = {},
  storedScanKeys,
  topicScanKeys,
} = {}) {
  return {
    async scan(cursor, { MATCH: matchPattern }) {
      const keys = matchPattern === 'topic:*:items'
        ? (topicScanKeys ?? Object.keys(topicSizes))
        : (storedScanKeys ?? Object.keys(storedValues));

      return {
        cursor: '0',
        keys,
      };
    },
    async mGet(keys) {
      return keys.map((key) => storedValues[key] ?? null);
    },
    multi() {
      const commands = [];
      return {
        ttl(key) {
          commands.push(['ttl', key]);
          return this;
        },
        zCard(key) {
          commands.push(['zCard', key]);
          return this;
        },
        async exec() {
          return commands.map(([method, key]) => {
            if (method === 'ttl') {
              return ttlValues[key] ?? -1;
            }

            return topicSizes[key] ?? 0;
          });
        },
      };
    },
  };
}

function createRequest(isExport = false) {
  return {
    headers: {
      host: 'example.com',
      'x-forwarded-proto': 'https',
      ...(isExport ? { 'x-export': 'true' } : {}),
    },
  };
}

test('parseTrailingWildcardPath accepts only a single trailing wildcard', () => {
  assert.deepEqual(parseTrailingWildcardPath('note*'), { isWildcard: true, prefix: 'note' });
  assert.deepEqual(parseTrailingWildcardPath('*'), { isWildcard: true, prefix: '' });
  assert.deepEqual(parseTrailingWildcardPath('note'), { isWildcard: false, prefix: 'note' });
  assert.throws(() => parseTrailingWildcardPath('no*te'), /single trailing "\*"/);
  assert.throws(() => parseTrailingWildcardPath('note**'), /single trailing "\*"/);
});

test('findMatchedPaths excludes topic homes for normal wildcard lookups', async () => {
  const redis = createFakeRedis({
    storedValues: {
      'surl:note': JSON.stringify({ type: 'text', content: 'hello' }),
      'surl:note-2': JSON.stringify({ type: 'html', content: '<p>ok</p>' }),
      'surl:note-topic': JSON.stringify({ type: 'topic', content: '<html></html>', title: 'Note Topic' }),
      'surl:other': JSON.stringify({ type: 'text', content: 'skip' }),
    },
  });

  const matchedPaths = await findMatchedPaths(redis, {
    prefix: 'note',
    excludeTopics: true,
  });

  assert.deepEqual(matchedPaths, ['note', 'note-2']);
});

test('listAuthenticatedItems returns wildcard lookup items with topic filtering and export semantics', async () => {
  const redis = createFakeRedis({
    storedValues: {
      'surl:note-a': JSON.stringify({ type: 'text', content: 'hello world content', title: 'Note A', created: '2026-03-20' }),
      'surl:topic-a': JSON.stringify({ type: 'topic', content: '<html></html>', title: 'Topic A', created: '2026-03-20' }),
      'surl:topic-a/child': JSON.stringify({ type: 'text', content: 'child body', title: 'Child' }),
    },
    ttlValues: {
      'surl:note-a': 61,
      'surl:topic-a': -1,
      'surl:topic-a/child': -1,
    },
    topicSizes: {
      'topic:topic-a:items': 3,
    },
  });

  const normalItems = await listAuthenticatedItems(createRequest(), redis, ['note-a', 'topic-a', 'topic-a/child'], {
    excludeTopics: true,
  });
  assert.equal(normalItems.length, 2);
  assert.deepEqual(normalItems.map((item) => item.path), ['note-a', 'topic-a/child']);
  assert.equal(normalItems[0].content, 'hello world con...');
  assert.equal(normalItems[0].ttl, 2);

  const exportedItems = await listAuthenticatedItems(createRequest(true), redis, ['note-a'], {
    excludeTopics: true,
    isExport: true,
  });
  assert.equal(exportedItems[0].content, 'hello world content');

  const topicItems = await listAuthenticatedItems(createRequest(), redis, ['topic-a', 'topic-a/child'], {
    onlyTopics: true,
  });
  assert.equal(topicItems.length, 1);
  assert.equal(topicItems[0].path, 'topic-a');
  assert.equal(topicItems[0].content, '2');
});
