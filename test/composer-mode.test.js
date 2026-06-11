import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPIC_CREATE_TYPE,
  buildDirectUploadBody,
  buildEditComposerSnapshot,
  buildCreatedValue,
  buildFileUploadData,
  buildFileMetadataRequestBody,
  buildInitialForm,
  buildTopicModeForm,
  buildRestoredForm,
  buildTextRequestBody,
  canSubmitComposerForm,
  formatTopicLabel,
  getComposerUiState,
  normalizeTtlValue,
  normalizeTopicNameValue,
  resolveTtlMinutes,
  splitCreatedForComposer,
} from '../web/src/lib/composer-mode.js';

test('normalizeTopicNameValue matches path rules, strips newlines, and rejects a leading slash', () => {
  assert.equal(normalizeTopicNameValue(' /anime/\ncastle? '), 'anime/castle');
  assert.equal(normalizeTopicNameValue('/'), '');
});

test('formatTopicLabel keeps a trailing slash while truncating long topic labels', () => {
  assert.equal(formatTopicLabel('anime'), 'anime/');
  assert.equal(formatTopicLabel('12345678901234567890'), '12345678901234…/');
});

test('normalizeTtlValue allows multiplication expressions only', () => {
  assert.equal(normalizeTtlValue('60*24'), '60*24');
  assert.equal(normalizeTtlValue(' 60 * 24 mins '), '60*24');
});

test('resolveTtlMinutes evaluates multiplication and treats empty factors as one', () => {
  assert.equal(resolveTtlMinutes(''), null);
  assert.equal(resolveTtlMinutes('60*24'), 1440);
  assert.equal(resolveTtlMinutes('60*'), 60);
  assert.equal(resolveTtlMinutes('*60'), 60);
  assert.equal(resolveTtlMinutes('*'), 1);
  assert.equal(resolveTtlMinutes('60**24'), 1440);
  assert.equal(resolveTtlMinutes('0*60'), 0);
  assert.equal(resolveTtlMinutes('9999999999999999*9999999999999999'), Number.MAX_SAFE_INTEGER);
});

test('buildTextRequestBody emits topic mutation payload for topic mode', () => {
  const form = {
    ...buildInitialForm('nested/topic'),
    convert: TOPIC_CREATE_TYPE,
    title: 'Anime Archive',
    createdDate: '2026-03-20',
    createdTime: '08:09',
    ttl: '1440',
    topic: 'nested/topic',
    path: 'ignored/path',
    content: '  anime/\ncastle  ',
  };

  assert.deepEqual(buildTextRequestBody(form), {
    path: 'anime/castle',
    type: TOPIC_CREATE_TYPE,
    title: 'Anime Archive',
    created: '2026-03-20 08:09:00',
  });
});

test('buildTextRequestBody keeps regular composer payload fields outside topic mode', () => {
  const form = {
    ...buildInitialForm('anime'),
    convert: 'qrcode',
    path: 'castle',
    title: 'Castle',
    createdDate: '2026-03-20',
    createdTime: '',
    topic: 'anime',
    ttl: '60',
    content: 'hello',
  };

  assert.deepEqual(buildTextRequestBody(form), {
    url: 'hello',
    path: 'castle',
    title: 'Castle',
    created: '2026-03-20',
    topic: 'anime',
    ttl: 60,
    convert: 'qrcode',
  });
});

test('buildTextRequestBody resolves ttl expressions before submit', () => {
  const form = {
    ...buildInitialForm(''),
    convert: 'text',
    path: 'ttl-expression',
    ttl: '60*24',
    content: 'hello',
  };

  assert.deepEqual(buildTextRequestBody(form), {
    url: 'hello',
    path: 'ttl-expression',
    ttl: 1440,
    convert: 'text',
  });
});

test('buildFileMetadataRequestBody emits a full file update path and explicit empty title', () => {
  const form = {
    ...buildInitialForm('post'),
    convert: 'file',
    path: 'bo-ke',
    title: '',
    createdDate: '2026-03-20',
    createdTime: '08:09',
    ttl: '',
    content: '',
  };

  assert.deepEqual(buildFileMetadataRequestBody(form), {
    path: 'post/bo-ke',
    type: 'file',
    title: '',
    ttl: 0,
    created: '2026-03-20 08:09:00',
  });
});

test('buildFileMetadataRequestBody resolves ttl expressions before submit', () => {
  const form = {
    ...buildInitialForm('post'),
    convert: 'file',
    path: 'bo-ke',
    title: '',
    ttl: '60*24',
    content: '',
  };

  assert.deepEqual(buildFileMetadataRequestBody(form), {
    path: 'post/bo-ke',
    type: 'file',
    title: '',
    ttl: 1440,
  });
});

test('buildFileUploadData can preserve the exact existing path for file replacement', () => {
  const form = {
    ...buildInitialForm('post'),
    path: 'bo-ke',
    title: 'Book',
    ttl: '30',
  };
  const data = buildFileUploadData(form, new Blob(['demo']), { preservePath: true });

  assert.equal(data.get('path'), 'post/bo-ke');
  assert.equal(data.get('title'), 'Book');
  assert.equal(data.get('ttl'), '30');
  assert.equal(data.get('topic'), null);
  assert.equal(data.get('preservePath'), 'true');
});

test('buildFileUploadData resolves ttl expressions for form uploads', () => {
  const form = {
    ...buildInitialForm('post'),
    path: 'bo-ke',
    ttl: '60*24',
  };
  const data = buildFileUploadData(form, new Blob(['demo']));

  assert.equal(data.get('ttl'), '1440');
});

test('buildDirectUploadBody emits direct upload metadata for new files', () => {
  const form = {
    ...buildInitialForm('post'),
    path: 'bo-ke',
    title: 'Book',
    createdDate: '2026-03-20',
    createdTime: '08:09',
    ttl: '60*24',
  };
  const file = { name: 'book.png', type: 'image/png', size: 1234 };

  assert.deepEqual(buildDirectUploadBody(form, file), {
    filename: 'book.png',
    contentType: 'image/png',
    size: 1234,
    preservePath: false,
    allowOverwrite: false,
    path: 'bo-ke',
    title: 'Book',
    created: '2026-03-20 08:09:00',
    topic: 'post',
    ttl: 1440,
  });
});

test('buildDirectUploadBody can preserve the full existing path for file replacement', () => {
  const form = {
    ...buildInitialForm('post'),
    path: 'bo-ke',
    title: 'Book',
  };
  const file = { name: 'book.png', type: 'image/png', size: 1234 };

  assert.deepEqual(buildDirectUploadBody(form, file, { preservePath: true, allowOverwrite: true }), {
    filename: 'book.png',
    contentType: 'image/png',
    size: 1234,
    preservePath: true,
    allowOverwrite: true,
    path: 'post/bo-ke',
    title: 'Book',
  });
});

test('buildTopicModeForm clears all fields and forces topic type', () => {
  assert.deepEqual(buildTopicModeForm(), {
    convert: TOPIC_CREATE_TYPE,
    path: '',
    title: '',
    createdDate: '',
    createdTime: '',
    topic: '',
    ttl: '',
    content: '',
  });
});

test('buildRestoredForm falls back to defaults for empty snapshot fields', () => {
  assert.deepEqual(
    buildRestoredForm({ convert: '', path: '', title: '', createdDate: '', createdTime: '', topic: '', ttl: '', content: '' }, 'selected/topic'),
    { convert: 'none', path: '', title: '', createdDate: '', createdTime: '', topic: '', ttl: '', content: '' },
  );
});

test('buildRestoredForm rebuilds a saved composer snapshot', () => {
  assert.deepEqual(
    buildRestoredForm({
      convert: 'md2html',
      path: 'castle',
      title: 'Castle',
      createdDate: '2026-03-20',
      createdTime: '08:09',
      topic: 'anime',
      ttl: '30',
      content: '# heading',
    }, 'selected/topic'),
    {
      convert: 'md2html',
      path: 'castle',
      title: 'Castle',
      createdDate: '2026-03-20',
      createdTime: '08:09',
      topic: 'anime',
      ttl: '30',
      content: '# heading',
    },
  );
});

test('splitCreatedForComposer converts valid timestamps into local date and minute fields', () => {
  const fields = splitCreatedForComposer('2026-03-20T08:09:30Z');
  assert.match(fields.createdDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(fields.createdTime, /^\d{2}:\d{2}$/);
  assert.deepEqual(splitCreatedForComposer('illegal'), { createdDate: '', createdTime: '' });
});

test('buildEditComposerSnapshot rebuilds topic-relative text entries', () => {
  assert.deepEqual(
    buildEditComposerSnapshot({
      path: 'post/demo',
      type: 'md',
      title: 'Demo',
      created: '2026-03-20T08:09:00Z',
      ttl: 29,
      content: '# Demo',
    }, [{ path: 'post' }]),
    {
      convert: 'md2html',
      path: 'demo',
      title: 'Demo',
      createdDate: splitCreatedForComposer('2026-03-20T08:09:00Z').createdDate,
      createdTime: splitCreatedForComposer('2026-03-20T08:09:00Z').createdTime,
      topic: 'post',
      ttl: '29',
      content: '# Demo',
      metaOpen: true,
    },
  );
});

test('buildEditComposerSnapshot rebuilds file entries with an existing file placeholder', () => {
  assert.deepEqual(
    buildEditComposerSnapshot({
      path: 'post/bo-ke',
      type: 'file',
      title: 'Book',
      created: '2026-03-20T08:09:00Z',
      ttl: 7,
      content: 'post/default/object-key.png',
    }, [{ path: 'post' }]),
    {
      convert: 'file',
      path: 'bo-ke',
      title: 'Book',
      createdDate: splitCreatedForComposer('2026-03-20T08:09:00Z').createdDate,
      createdTime: splitCreatedForComposer('2026-03-20T08:09:00Z').createdTime,
      topic: 'post',
      ttl: '7',
      content: '',
      existingFile: { name: 'bo-ke', path: 'post/bo-ke' },
      metaOpen: true,
    },
  );
});

test('buildEditComposerSnapshot rebuilds topic entries and clears ttl', () => {
  assert.deepEqual(
    buildEditComposerSnapshot({
      path: 'post',
      type: TOPIC_CREATE_TYPE,
      title: 'Post',
      created: '',
      ttl: 30,
      content: '12',
    }, []),
    {
      convert: TOPIC_CREATE_TYPE,
      path: '',
      title: 'Post',
      createdDate: '',
      createdTime: '',
      topic: '',
      ttl: '',
      content: 'post',
      metaOpen: true,
    },
  );
});

test('canSubmitComposerForm requires a valid topic name in topic mode', () => {
  assert.equal(canSubmitComposerForm({
    busy: false,
    file: null,
    form: { ...buildInitialForm(''), convert: TOPIC_CREATE_TYPE, content: 'topic/name' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: false,
    file: null,
    form: { ...buildInitialForm(''), convert: TOPIC_CREATE_TYPE, content: '???\n' },
  }), false);
});

test('canSubmitComposerForm supports normal text and file submits outside topic mode', () => {
  assert.equal(canSubmitComposerForm({
    busy: false,
    file: null,
    form: { ...buildInitialForm(''), convert: 'none', content: 'hello' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: false,
    file: { name: 'demo.png' },
    form: { ...buildInitialForm(''), convert: 'none', content: '' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: true,
    file: { name: 'demo.png' },
    form: { ...buildInitialForm(''), convert: 'none', content: '' },
  }), false);
});

test('canSubmitComposerForm supports file edit placeholders and requires a file after removing one', () => {
  assert.equal(canSubmitComposerForm({
    busy: false,
    existingFile: { name: 'bo-ke', path: 'post/bo-ke' },
    fileEditMode: true,
    file: null,
    form: { ...buildInitialForm(''), convert: 'file', content: '' },
  }), true);

  assert.equal(canSubmitComposerForm({
    busy: false,
    existingFile: null,
    fileEditMode: true,
    file: null,
    form: { ...buildInitialForm(''), convert: 'file', content: '' },
  }), false);
});

test('getComposerUiState exposes topic mode UI constraints', () => {
  assert.deepEqual(
    getComposerUiState({
      form: { ...buildInitialForm('anime'), convert: TOPIC_CREATE_TYPE, title: 'Hidden title' },
      selectedTopic: { path: 'anime' },
      globalDragging: false,
      metaOpen: true,
    }),
    {
      editorPlaceholder: 'Input a valid topic name',
      pathInputVisible: false,
      pathPlaceholder: 'relative/path',
      showMetaToggle: true,
      metaVisible: true,
      topicPrefix: '/',
      ttlDisabled: true,
      ttlPlaceholder: 'never expires',
      ttlSuffixVisible: false,
    },
  );
});

test('getComposerUiState keeps normal editor affordances outside topic mode', () => {
  assert.deepEqual(
    getComposerUiState({
      form: { ...buildInitialForm(''), convert: 'none', title: 'Shown title' },
      selectedTopic: null,
      globalDragging: false,
      metaOpen: false,
    }),
    {
      editorPlaceholder: '',
      pathInputVisible: true,
      pathPlaceholder: 'custom/url/slug',
      showMetaToggle: true,
      metaVisible: false,
      topicPrefix: '/',
      ttlDisabled: false,
      ttlPlaceholder: 'never expires',
      ttlSuffixVisible: false,
    },
  );
});

test('getComposerUiState keeps meta hidden when filled values exist but the user collapsed it', () => {
  assert.equal(
    getComposerUiState({
      form: { ...buildInitialForm(''), convert: 'none', createdDate: '2026-03-20' },
      selectedTopic: null,
      globalDragging: false,
      metaOpen: false,
    }).metaVisible,
    false,
  );
});

test('getComposerUiState still allows the title row to stay hidden after topic auto-open was dismissed', () => {
  assert.deepEqual(
    getComposerUiState({
      form: { ...buildInitialForm('anime'), convert: 'none', title: '' },
      selectedTopic: { path: 'anime' },
      globalDragging: false,
      metaOpen: false,
    }).metaVisible,
    false,
  );
});

test('getComposerUiState shows ttl suffix only when a numeric ttl is present', () => {
  assert.equal(
    getComposerUiState({
      form: { ...buildInitialForm(''), convert: 'none', ttl: '30' },
      selectedTopic: null,
      globalDragging: false,
      metaOpen: false,
    }).ttlSuffixVisible,
    true,
  );
});

test('buildCreatedValue returns null when no date is provided', () => {
  assert.equal(buildCreatedValue({ createdDate: '', createdTime: '08:09' }), null);
});

test('buildCreatedValue returns a date when time is omitted', () => {
  assert.equal(buildCreatedValue({ createdDate: '2026-03-20', createdTime: '' }), '2026-03-20');
});

test('buildCreatedValue appends seconds when date and time are both provided', () => {
  assert.equal(buildCreatedValue({ createdDate: '2026-03-20', createdTime: '08:09' }), '2026-03-20 08:09:00');
});

test('buildFileUploadData only appends created when a date exists', () => {
  const withCreated = buildFileUploadData({
    ...buildInitialForm('anime'),
    createdDate: '2026-03-20',
    createdTime: '08:09',
  }, new File(['demo'], 'demo.txt', { type: 'text/plain' }));
  const withoutCreated = buildFileUploadData({
    ...buildInitialForm('anime'),
    createdDate: '',
    createdTime: '08:09',
  }, new File(['demo'], 'demo.txt', { type: 'text/plain' }));

  assert.equal(withCreated.get('created'), '2026-03-20 08:09:00');
  assert.equal(withoutCreated.get('created'), null);
});
