export const TOPIC_CREATE_TYPE = 'topic';

const PATH_SANITIZE_PATTERN = /[^a-zA-Z0-9_.\-()/]/g;

export function buildInitialForm(topic = '') {
  return { convert: 'none', path: '', title: '', topic, ttl: '', url: '' };
}

export function isTopicCreateType(convert) {
  return convert === TOPIC_CREATE_TYPE;
}

export function normalizePathValue(value) {
  return value.replace(PATH_SANITIZE_PATTERN, '').slice(0, 99);
}

export function normalizeTtlValue(value) {
  return value.replace(/\D/g, '');
}

export function normalizeTopicNameValue(value) {
  return normalizePathValue(value.replace(/[\r\n]+/g, '')).replace(/^\/+/, '');
}

export function buildTopicModeForm() {
  return {
    convert: TOPIC_CREATE_TYPE,
    path: '',
    title: '',
    topic: '',
    ttl: '',
    url: '',
  };
}

export function buildRestoredForm(snapshot, fallbackTopic = '') {
  if (!snapshot) return buildInitialForm(fallbackTopic);
  return {
    convert: snapshot.convert || 'none',
    path: snapshot.path || '',
    title: snapshot.title || '',
    topic: snapshot.topic ?? fallbackTopic,
    ttl: snapshot.ttl || '',
    url: snapshot.url || '',
  };
}

export function buildTextRequestBody(form) {
  if (isTopicCreateType(form.convert)) {
    return {
      path: normalizeTopicNameValue(form.url.trim()),
      type: TOPIC_CREATE_TYPE,
    };
  }

  const body = { url: form.url.trim() };
  if (form.path.trim()) body.path = form.path.trim();
  if (form.title.trim()) body.title = form.title.trim();
  if (form.topic) body.topic = form.topic;
  if (form.ttl.trim()) body.ttl = Number(form.ttl.trim());
  if (form.convert !== 'none') body.convert = form.convert;
  return body;
}

export function buildFileUploadData(form, file) {
  const data = new FormData();
  data.append('file', file);
  if (form.path.trim()) data.append('path', form.path.trim());
  if (form.title.trim()) data.append('title', form.title.trim());
  if (form.topic) data.append('topic', form.topic);
  if (form.ttl.trim()) data.append('ttl', form.ttl.trim());
  return data;
}

export function canSubmitComposerForm({ busy, file, form }) {
  if (busy) return false;
  if (isTopicCreateType(form.convert)) {
    return !file && Boolean(normalizeTopicNameValue(form.url.trim()));
  }
  return Boolean(file || form.url.trim());
}

export function getComposerUiState({
  form,
  selectedTopic = null,
  globalDragging = false,
  titleOpen = false,
}) {
  const topicMode = isTopicCreateType(form.convert);
  return {
    editorPlaceholder: topicMode ? 'Input a valid topic name' : '',
    pathInputVisible: !topicMode,
    pathPlaceholder: selectedTopic ? 'relative/path' : 'custom/url/slug',
    showTitleToggle: !globalDragging && !topicMode,
    titleVisible: !topicMode && (titleOpen || Boolean(form.title)),
    topicPrefix: topicMode ? '/' : (selectedTopic ? `${selectedTopic.path}/` : '/'),
    ttlDisabled: topicMode,
    ttlPlaceholder: topicMode ? '0' : '1440',
  };
}
