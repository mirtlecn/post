import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteWildcardPaths } from '../lib/handlers/remove.js';

test('deleteWildcardPaths continues after per-item failures and returns a summary', async () => {
  const calls = [];
  const summary = await deleteWildcardPaths({
    redis: {},
    prefix: 'note',
    requestedType: '',
    findMatchedPathsFn: async () => ['note-a', 'note-b', 'note-c'],
    deleteStoredPathFn: async ({ path }) => {
      calls.push(path);

      if (path === 'note-b') {
        return {
          ok: false,
          status: 404,
          error: { code: 'not_found', message: 'missing' },
        };
      }

      if (path === 'note-c') {
        throw new Error('boom');
      }

      return {
        ok: true,
        data: {
          deleted: path,
          type: 'text',
          title: '',
          created: '2026-03-20T00:00:00Z',
          content: 'ok',
        },
      };
    },
  });

  assert.deepEqual(calls, ['note-a', 'note-b', 'note-c']);
  assert.deepEqual(summary.deleted, [{
    deleted: 'note-a',
    type: 'text',
    title: '',
    created: '2026-03-20T00:00:00Z',
    content: 'ok',
  }]);
  assert.deepEqual(summary.errors, [
    { path: 'note-b', code: 'not_found', message: 'missing' },
    { path: 'note-c', code: 'internal', message: 'boom' },
  ]);
});

test('deleteWildcardPaths requests topic-only matches for topic wildcard deletes', async () => {
  const matcherCalls = [];

  await deleteWildcardPaths({
    redis: {},
    prefix: 'topic',
    requestedType: 'topic',
    findMatchedPathsFn: async (redis, options) => {
      matcherCalls.push(options);
      return [];
    },
  });

  assert.deepEqual(matcherCalls, [{
    prefix: 'topic',
    onlyTopics: true,
    excludeTopics: false,
  }]);
});
