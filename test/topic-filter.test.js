import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPathPrefixFilter, filterDashboardItems, filterItemsByTopic } from '../web/src/lib/topic-filter.js';

test('filterItemsByTopic keeps topic itself first and includes topic members only', () => {
  const items = [
    { path: 'zeta', type: 'text' },
    { path: 'topic/child-b', type: 'text' },
    { path: 'topic', type: 'topic' },
    { path: 'topic/child-a', type: 'text' },
    { path: 'topic-other', type: 'topic' },
  ];

  assert.deepEqual(
    filterItemsByTopic(items, 'topic').map((item) => item.path),
    ['topic', 'topic/child-b', 'topic/child-a'],
  );
});

test('filterItemsByTopic returns original items when no topic is selected', () => {
  const items = [{ path: 'topic', type: 'topic' }, { path: 'topic/child', type: 'text' }];
  assert.equal(filterItemsByTopic(items, ''), items);
});

test('filterDashboardItems intersects selected topic with topic create mode', () => {
  const items = [
    { path: 'topic', type: 'topic' },
    { path: 'topic/child', type: 'text' },
    { path: 'another-topic', type: 'topic' },
  ];

  assert.deepEqual(
    filterDashboardItems(items, { selectedTopicPath: 'topic', createType: 'topic' }).map((item) => item.path),
    ['topic'],
  );
});

test('filterDashboardItems falls back to selected topic filtering outside topic create mode', () => {
  const items = [
    { path: 'topic/child-b', type: 'text' },
    { path: 'topic', type: 'topic' },
    { path: 'topic/child-a', type: 'text' },
    { path: 'another-topic', type: 'topic' },
  ];

  assert.deepEqual(
    filterDashboardItems(items, { selectedTopicPath: 'topic', createType: 'none' }).map((item) => item.path),
    ['topic', 'topic/child-b', 'topic/child-a'],
  );
});

test('buildPathPrefixFilter combines selected topic and path fields', () => {
  assert.equal(buildPathPrefixFilter({ selectedTopicPath: 'post', pathFilter: 'new' }), 'post/new');
  assert.equal(buildPathPrefixFilter({ selectedTopicPath: 'post', pathFilter: '' }), '');
  assert.equal(buildPathPrefixFilter({ selectedTopicPath: '', pathFilter: '/post/new/' }), 'post/new');
});

test('filterDashboardItems intersects topic, path prefix, type, and ttl filters', () => {
  const items = [
    { path: 'post/new-a', type: 'md', ttl: 10 },
    { path: 'post/new-b', type: 'md', ttl: 40 },
    { path: 'post/new-c', type: 'text', ttl: 10 },
    { path: 'post/old-a', type: 'md', ttl: 10 },
    { path: 'post/new-never', type: 'md', ttl: null },
    { path: 'other/new-a', type: 'md', ttl: 10 },
  ];

  assert.deepEqual(
    filterDashboardItems(items, {
      selectedTopicPath: 'post',
      pathFilter: 'new',
      createType: 'md2html',
      ttlFilter: '30',
    }).map((item) => item.path),
    ['post/new-a'],
  );
});
