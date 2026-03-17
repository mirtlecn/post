import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPIC_CREATE_TYPE,
  buildInitialForm,
  buildTopicModeForm,
  buildRestoredForm,
  buildTextRequestBody,
  canSubmitComposerForm,
  getComposerUiState,
  normalizeTopicNameValue,
} from '../web/src/lib/composer-mode.js';

test('normalizeTopicNameValue matches path rules, strips newlines, and rejects a leading slash', () => {
  assert.equal(normalizeTopicNameValue(' /anime/\ncastle? '), 'anime/castle');
  assert.equal(normalizeTopicNameValue('/'), '');
});

test('buildTextRequestBody emits topic mutation payload for topic mode', () => {
  const form = {
    ...buildInitialForm('nested/topic'),
    convert: TOPIC_CREATE_TYPE,
    title: 'Ignored',
    ttl: '1440',
    topic: 'nested/topic',
    path: 'ignored/path',
    url: '  anime/\ncastle  ',
  };

  assert.deepEqual(buildTextRequestBody(form), {
    path: 'anime/castle',
    type: TOPIC_CREATE_TYPE,
  });
});

test('buildTextRequestBody keeps regular composer payload fields outside topic mode', () => {
  const form = {
    ...buildInitialForm('anime'),
    convert: 'qrcode',
    path: 'castle',
    title: 'Castle',
    topic: 'anime',
    ttl: '60',
    url: 'hello',
  };

  assert.deepEqual(buildTextRequestBody(form), {
    url: 'hello',
    path: 'castle',
    title: 'Castle',
    topic: 'anime',
    ttl: 60,
    convert: 'qrcode',
  });
});

test('buildTopicModeForm clears all fields and forces topic type', () => {
  assert.deepEqual(buildTopicModeForm(), {
    convert: TOPIC_CREATE_TYPE,
    path: '',
    title: '',
    topic: '',
    ttl: '',
    url: '',
  });
});

test('buildRestoredForm falls back to defaults for empty snapshot fields', () => {
  assert.deepEqual(
    buildRestoredForm({ convert: '', path: '', title: '', topic: '', ttl: '', url: '' }, 'selected/topic'),
    { convert: 'none', path: '', title: '', topic: '', ttl: '', url: '' },
  );
});

test('buildRestoredForm rebuilds a saved composer snapshot', () => {
  assert.deepEqual(
    buildRestoredForm({
      convert: 'md2html',
      path: 'castle',
      title: 'Castle',
      topic: 'anime',
      ttl: '30',
      url: '# heading',
    }, 'selected/topic'),
    {
      convert: 'md2html',
      path: 'castle',
      title: 'Castle',
      topic: 'anime',
      ttl: '30',
      url: '# heading',
    },
  );
});

test('canSubmitComposerForm requires a valid topic name in topic mode', () => {
  assert.equal(canSubmitComposerForm({
    busy: false,
    file: null,
    form: { ...buildInitialForm(''), convert: TOPIC_CREATE_TYPE, url: 'topic/name' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: false,
    file: null,
    form: { ...buildInitialForm(''), convert: TOPIC_CREATE_TYPE, url: '???\n' },
  }), false);
});

test('canSubmitComposerForm supports normal text and file submits outside topic mode', () => {
  assert.equal(canSubmitComposerForm({
    busy: false,
    file: null,
    form: { ...buildInitialForm(''), convert: 'none', url: 'hello' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: false,
    file: { name: 'demo.png' },
    form: { ...buildInitialForm(''), convert: 'none', url: '' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: true,
    file: { name: 'demo.png' },
    form: { ...buildInitialForm(''), convert: 'none', url: '' },
  }), false);
});

test('getComposerUiState exposes topic mode UI constraints', () => {
  assert.deepEqual(
    getComposerUiState({
      form: { ...buildInitialForm('anime'), convert: TOPIC_CREATE_TYPE, title: 'Hidden title' },
      selectedTopic: { path: 'anime' },
      globalDragging: false,
      titleOpen: true,
    }),
    {
      editorPlaceholder: 'Input a valid topic name',
      pathInputVisible: false,
      pathPlaceholder: 'relative/path',
      showTitleToggle: false,
      titleVisible: false,
      topicPrefix: '/',
      ttlDisabled: true,
      ttlPlaceholder: '0',
    },
  );
});

test('getComposerUiState keeps normal editor affordances outside topic mode', () => {
  assert.deepEqual(
    getComposerUiState({
      form: { ...buildInitialForm(''), convert: 'none', title: 'Shown title' },
      selectedTopic: null,
      globalDragging: false,
      titleOpen: false,
    }),
    {
      editorPlaceholder: '',
      pathInputVisible: true,
      pathPlaceholder: 'custom/url/slug',
      showTitleToggle: true,
      titleVisible: true,
      topicPrefix: '/',
      ttlDisabled: false,
      ttlPlaceholder: '1440',
    },
  );
});
