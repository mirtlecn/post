import test from 'node:test';
import assert from 'node:assert/strict';
import { LIST_BATCH_SIZE } from '../web/src/config.js';
import {
  buildVisibleListItems,
  formatCreatedLabel,
  formatTtlLabel,
  getItemTypeLabel,
} from '../web/src/lib/list-panel.js';

test('formatTtlLabel keeps never for empty and rounds into h/d buckets', () => {
  assert.equal(formatTtlLabel(null), 'never');
  assert.equal(formatTtlLabel(30), '30m');
  assert.equal(formatTtlLabel(90), '2h');
  assert.equal(formatTtlLabel(1440), '1d');
});

test('formatCreatedLabel keeps illegal and formats valid dates', () => {
  assert.equal(formatCreatedLabel('illegal'), 'illegal');
  assert.equal(formatCreatedLabel('bad-value'), 'bad-value');
  assert.match(formatCreatedLabel('2026-03-20T08:09:00.000Z'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('getItemTypeLabel falls back to text metadata', () => {
  assert.equal(getItemTypeLabel('topic'), 'topic');
  assert.equal(getItemTypeLabel('custom'), 'custom');
  assert.equal(getItemTypeLabel(''), 'text');
});

test('buildVisibleListItems decorates rows and reports remaining items', () => {
  const items = Array.from({ length: LIST_BATCH_SIZE + 2 }, (_, index) => ({
    path: `item-${index + 1}`,
    type: 'text',
    ttl: index === 0 ? 30 : null,
    created: index === 0 ? '2026-03-20T08:09:00.000Z' : '',
    content: 'demo',
  }));

  const firstBatch = buildVisibleListItems(items);
  assert.equal(firstBatch.visibleCount, LIST_BATCH_SIZE);
  assert.equal(firstBatch.hasMore, true);
  assert.equal(firstBatch.rows.length, LIST_BATCH_SIZE);
  assert.equal(firstBatch.rows[0].ttlText, '30m');

  const completeBatch = buildVisibleListItems(items, 99);
  assert.equal(completeBatch.visibleCount, items.length);
  assert.equal(completeBatch.hasMore, false);
  assert.equal(completeBatch.rows.length, items.length);
});
