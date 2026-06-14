import test from 'node:test';
import assert from 'node:assert/strict';
import { sortItems } from '../web/src/config.js';

test('sortItems orders newest created entries first and falls back to path order', () => {
  const items = [
    { path: 'older', created: '2026-03-20T08:00:00Z' },
    { path: 'same-b', created: '2026-03-21T08:00:00Z' },
    { path: 'missing', created: '' },
    { path: 'same-a', created: '2026-03-21T08:00:00Z' },
    { path: 'invalid', created: 'illegal' },
    { path: 'newest', created: '2026-03-22T08:00:00Z' },
  ];

  assert.deepEqual(
    sortItems(items).map((item) => item.path),
    ['newest', 'same-a', 'same-b', 'older', 'missing', 'invalid'],
  );
  assert.deepEqual(items.map((item) => item.path), ['older', 'same-b', 'missing', 'same-a', 'invalid', 'newest']);
});
