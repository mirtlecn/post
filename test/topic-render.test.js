import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopicIndexMarkdown } from '../lib/services/topic-render.js';

function topicItem({
  path,
  type = 'md',
  title = '',
  updatedAt,
}) {
  return {
    path,
    type,
    title,
    updatedAt,
  };
}

test('buildTopicIndexMarkdown sorts by updatedAt and writes full dates inline', () => {
  const markdown = buildTopicIndexMarkdown('anime', 'Anime', [
    {
      path: 'castle-notes',
      type: 'text',
      title: 'Castle in the Sky Notes',
      updatedAt: Date.UTC(2026, 11, 21, 10, 0, 0) / 1000,
    },
    {
      path: 'howl-visual',
      type: 'html',
      title: 'Howl Visual Draft',
      updatedAt: Date.UTC(2026, 11, 23, 10, 0, 0) / 1000,
    },
    {
      path: 'poster-pack-winter.zip',
      type: 'file',
      title: 'Poster Pack Winter',
      updatedAt: Date.UTC(2025, 9, 18, 10, 0, 0) / 1000,
    },
  ]);

  assert.equal(
    markdown,
    [
      '<div style="font-size: 1.3em; font-weight: bold">Anime</div>',
      '\n\n',
      '<span style="color: #666;">Home</span>',
      '\n\n\n\n\n\n',
      '- [Howl Visual Draft](</anime/howl-visual>) · 2026-12-23',
      '- [Castle in the Sky Notes](</anime/castle-notes>) ☰ · 2026-12-21',
      '- [Poster Pack Winter](</anime/poster-pack-winter.zip>) ◫ · 2025-10-18',
    ].join('\n'),
  );
});

test('buildTopicIndexMarkdown formats dates in Asia/Shanghai', () => {
  const markdown = buildTopicIndexMarkdown('anime', 'Anime', [
    {
      path: 'timezone-check',
      type: 'text',
      title: 'Timezone Check',
      updatedAt: Date.UTC(2023, 7, 16, 16, 0, 0) / 1000,
    },
  ]);

  assert.match(markdown, /\[Timezone Check]\(<\/anime\/timezone-check>\) ☰ · 2023-08-17/);
});

test('buildTopicIndexMarkdown uses full path fallback and type marks', () => {
  const markdown = buildTopicIndexMarkdown('anime', 'Anime', [
    {
      path: 'notes/howl-visual',
      fullPath: 'anime/notes/howl-visual',
      type: 'url',
      title: '',
      updatedAt: Date.UTC(2026, 11, 19, 10, 0, 0) / 1000,
    },
  ]);

  assert.match(markdown, /^<div style="font-size: 1.3em; font-weight: bold">Anime<\/div>/);
  assert.match(markdown, /\[notes\/howl-visual]\(<\/anime\/notes\/howl-visual>\) ↗ · 2026-12-19/);
});

test('buildTopicIndexMarkdown keeps md unmarked and qrcode as text-like mark', () => {
  const markdown = buildTopicIndexMarkdown('anime', 'Anime', [
    {
      path: 'entry-md',
      type: 'md',
      title: 'Markdown Entry',
      updatedAt: Date.UTC(2026, 11, 19, 10, 0, 0) / 1000,
    },
    {
      path: 'entry-qr',
      type: 'qrcode',
      title: 'QRCode Entry',
      updatedAt: Date.UTC(2026, 11, 18, 10, 0, 0) / 1000,
    },
  ]);

  assert.match(markdown, /\[Markdown Entry]\(<\/anime\/entry-md>\) · 2026-12-19/);
  assert.match(markdown, /\[QRCode Entry]\(<\/anime\/entry-qr>\) ☰ · 2026-12-18/);
});

test('buildTopicIndexMarkdown wraps hrefs so parentheses in paths stay unambiguous', () => {
  const markdown = buildTopicIndexMarkdown('anime(list)', 'anime(list)', [
    {
      path: 'notes/(draft)',
      type: 'text',
      title: 'Draft',
      updatedAt: Date.UTC(2026, 11, 19, 10, 0, 0) / 1000,
    },
  ]);

  assert.match(markdown, /\[Draft]\(<\/anime\(list\)\/notes\/\(draft\)>\) ☰ · 2026-12-19/);
});

test('buildTopicIndexMarkdown groups more than 10 cross-year items by display year', () => {
  const sameTimestamp = Date.UTC(2026, 4, 23, 10, 0, 0) / 1000;
  const markdown = buildTopicIndexMarkdown('anime', 'Anime', [
    topicItem({ path: 'same-b', type: 'url', title: 'Same B', updatedAt: sameTimestamp }),
    topicItem({ path: 'same-a', type: 'text', title: 'Same A', updatedAt: sameTimestamp }),
    topicItem({ path: 'entry-2026-2', title: 'Entry 2026 2', updatedAt: Date.UTC(2026, 4, 22, 10, 0, 0) / 1000 }),
    topicItem({ path: 'entry-2026-3', title: 'Entry 2026 3', updatedAt: Date.UTC(2026, 4, 21, 10, 0, 0) / 1000 }),
    topicItem({ path: 'entry-2026-4', title: 'Entry 2026 4', updatedAt: Date.UTC(2026, 4, 20, 10, 0, 0) / 1000 }),
    topicItem({ path: 'entry-2026-5', title: 'Entry 2026 5', updatedAt: Date.UTC(2026, 4, 19, 10, 0, 0) / 1000 }),
    topicItem({ path: 'entry-2025-1', title: 'Entry 2025 1', updatedAt: Date.UTC(2025, 10, 18, 10, 0, 0) / 1000 }),
    topicItem({ path: 'entry-2025-2', type: 'file', title: 'Entry 2025 2', updatedAt: Date.UTC(2025, 10, 17, 10, 0, 0) / 1000 }),
    topicItem({ path: 'entry-2025-3', title: 'Entry 2025 3', updatedAt: Date.UTC(2025, 10, 16, 10, 0, 0) / 1000 }),
    topicItem({ path: 'entry-2025-4', title: 'Entry 2025 4', updatedAt: Date.UTC(2025, 10, 15, 10, 0, 0) / 1000 }),
    topicItem({ path: 'entry-2025-5', title: 'Entry 2025 5', updatedAt: Date.UTC(2025, 10, 14, 10, 0, 0) / 1000 }),
  ]);

  assert.match(markdown, /\n## 2026\n\n- \[Same A]\(<\/anime\/same-a>\) ☰ · 05-23/);
  assert.match(markdown, /\[Same B]\(<\/anime\/same-b>\) ↗ · 05-23/);
  assert.match(markdown, /\n## 2025\n\n- \[Entry 2025 1]\(<\/anime\/entry-2025-1>\) · 11-18/);
  assert.match(markdown, /\[Entry 2025 2]\(<\/anime\/entry-2025-2>\) ◫ · 11-17/);
  assert.doesNotMatch(markdown, /2026-05-23/);
  assert.ok(markdown.indexOf('same-a') < markdown.indexOf('same-b'));
  assert.ok(markdown.indexOf('## 2026') < markdown.indexOf('## 2025'));
});

test('buildTopicIndexMarkdown keeps 10 cross-year items flat', () => {
  const items = Array.from({ length: 10 }, (_, index) => topicItem({
    path: `entry-${index}`,
    title: `Entry ${index}`,
    updatedAt: Date.UTC(index < 5 ? 2026 : 2025, 4, 23 - index, 10, 0, 0) / 1000,
  }));

  const markdown = buildTopicIndexMarkdown('anime', 'Anime', items);

  assert.doesNotMatch(markdown, /\n## 2026/);
  assert.match(markdown, /\[Entry 0]\(<\/anime\/entry-0>\) · 2026-05-23/);
  assert.match(markdown, /\[Entry 5]\(<\/anime\/entry-5>\) · 2025-05-18/);
});

test('buildTopicIndexMarkdown keeps more than 10 same-year items flat', () => {
  const items = Array.from({ length: 11 }, (_, index) => topicItem({
    path: `entry-${index}`,
    title: `Entry ${index}`,
    updatedAt: Date.UTC(2026, 4, 23 - index, 10, 0, 0) / 1000,
  }));

  const markdown = buildTopicIndexMarkdown('anime', 'Anime', items);

  assert.doesNotMatch(markdown, /\n## 2026/);
  assert.match(markdown, /\[Entry 0]\(<\/anime\/entry-0>\) · 2026-05-23/);
  assert.match(markdown, /\[Entry 10]\(<\/anime\/entry-10>\) · 2026-05-13/);
});

test('buildTopicIndexMarkdown groups by Asia/Shanghai display year', () => {
  const items = [
    topicItem({
      path: 'shanghai-new-year',
      type: 'text',
      title: 'Shanghai New Year',
      updatedAt: Date.UTC(2025, 11, 31, 16, 30, 0) / 1000,
    }),
    ...Array.from({ length: 10 }, (_, index) => topicItem({
      path: `december-${index}`,
      title: `December ${index}`,
      updatedAt: Date.UTC(2025, 11, 30 - index, 16, 30, 0) / 1000,
    })),
  ];

  const markdown = buildTopicIndexMarkdown('anime', 'Anime', items);

  assert.match(markdown, /\n## 2026\n\n- \[Shanghai New Year]\(<\/anime\/shanghai-new-year>\) ☰ · 01-01/);
  assert.match(markdown, /\n## 2025\n\n- \[December 0]\(<\/anime\/december-0>\) · 12-31/);
  assert.doesNotMatch(markdown, /2026-01-01/);
});
