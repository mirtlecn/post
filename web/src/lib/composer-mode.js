export const TOPIC_CREATE_TYPE = 'topic';
const TOPIC_LABEL_MAX_CHARS = 16;

const PATH_SANITIZE_PATTERN = /[^a-zA-Z0-9_.\-()/]/g;
const CREATED_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CREATED_TIME_PATTERN = /^\d{2}:\d{2}$/;
const EDITABLE_CONVERT_TYPES = new Set(['url', 'text', 'html', 'qrcode']);

/**
 * @typedef {object} ComposerForm
 * @property {string} convert
 * @property {string} path
 * @property {string} title
 * @property {string} createdDate
 * @property {string} createdTime
 * @property {string} topic
 * @property {string} ttl
 * @property {string} content
 */

/**
 * @typedef {ComposerForm & { metaOpen?: boolean }} ComposerSnapshot
 */

/**
 * @typedef {object} SelectedTopic
 * @property {string} path
 * @property {string} [title]
 */

export function buildInitialForm(topic = '') {
  return { convert: 'none', path: '', title: '', createdDate: '', createdTime: '', topic, ttl: '', content: '' };
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

export function formatTopicLabel(path, maxChars = TOPIC_LABEL_MAX_CHARS) {
  if (!path) return '/';
  const suffixedPath = `${path}/`;
  if (suffixedPath.length <= maxChars) return suffixedPath;
  return `${suffixedPath.slice(0, Math.max(1, maxChars - 2))}…/`;
}

export function buildTopicModeForm() {
  return {
    convert: TOPIC_CREATE_TYPE,
    path: '',
    title: '',
    createdDate: '',
    createdTime: '',
    topic: '',
    ttl: '',
    content: '',
  };
}

export function buildRestoredForm(snapshot, fallbackTopic = '') {
  if (!snapshot) return buildInitialForm(fallbackTopic);
  return {
    convert: snapshot.convert || 'none',
    path: snapshot.path || '',
    title: snapshot.title || '',
    createdDate: snapshot.createdDate || '',
    createdTime: snapshot.createdTime || '',
    topic: snapshot.topic ?? fallbackTopic,
    ttl: snapshot.ttl || '',
    content: snapshot.content || snapshot.url || '',
  };
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

export function splitCreatedForComposer(created) {
  if (!created || created === 'illegal') {
    return { createdDate: '', createdTime: '' };
  }

  const date = new Date(created);
  if (Number.isNaN(date.getTime())) {
    return { createdDate: '', createdTime: '' };
  }

  return {
    createdDate: `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
    createdTime: `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`,
  };
}

function normalizeEditConvertType(type) {
  if (type === 'md') return 'md2html';
  if (EDITABLE_CONVERT_TYPES.has(type)) return type;
  return 'none';
}

function resolveItemTopic(path, topics = []) {
  return topics
    .map((topic) => topic?.path || '')
    .filter((topicPath) => topicPath && path.startsWith(`${topicPath}/`))
    .sort((a, b) => b.length - a.length)[0] || '';
}

function formatRemainingTtl(ttl) {
  if (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl <= 0) {
    return '';
  }

  return String(Math.ceil(ttl));
}

export function buildEditComposerSnapshot(item, topics = []) {
  const type = item?.type || 'text';
  const path = item?.path || '';
  const { createdDate, createdTime } = splitCreatedForComposer(item?.created);
  const metaOpen = Boolean(item?.title || createdDate);

  if (type === TOPIC_CREATE_TYPE) {
    return {
      convert: TOPIC_CREATE_TYPE,
      path: '',
      title: item?.title || '',
      createdDate,
      createdTime,
      topic: '',
      ttl: '',
      content: path,
      metaOpen,
    };
  }

  const topic = resolveItemTopic(path, topics);
  const relativePath = topic ? path.slice(topic.length + 1) : path;

  return {
    convert: normalizeEditConvertType(type),
    path: relativePath,
    title: item?.title || '',
    createdDate,
    createdTime,
    topic,
    ttl: formatRemainingTtl(item?.ttl),
    content: type === 'file' ? '' : (item?.content || ''),
    metaOpen,
  };
}

export function buildCreatedValue({ createdDate = '', createdTime = '' }) {
  const normalizedDate = createdDate.trim();
  const normalizedTime = createdTime.trim();

  if (!CREATED_DATE_PATTERN.test(normalizedDate)) return null;
  if (!normalizedTime) return normalizedDate;
  if (!CREATED_TIME_PATTERN.test(normalizedTime)) return normalizedDate;

  return `${normalizedDate} ${normalizedTime}:00`;
}

export function buildTextRequestBody(form) {
  const created = buildCreatedValue(form);

  if (isTopicCreateType(form.convert)) {
    const body = {
      path: normalizeTopicNameValue(form.content.trim()),
      type: TOPIC_CREATE_TYPE,
    };
    if (form.title.trim()) body.title = form.title.trim();
    if (created) body.created = created;
    return body;
  }

  const body = { url: form.content.trim() };
  if (form.path.trim()) body.path = form.path.trim();
  if (form.title.trim()) body.title = form.title.trim();
  if (created) body.created = created;
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
  const created = buildCreatedValue(form);
  if (created) data.append('created', created);
  if (form.topic) data.append('topic', form.topic);
  if (form.ttl.trim()) data.append('ttl', form.ttl.trim());
  return data;
}

export function canSubmitComposerForm({ busy, file, form }) {
  if (busy) return false;
  if (isTopicCreateType(form.convert)) {
    return !file && Boolean(normalizeTopicNameValue(form.content.trim()));
  }
  return Boolean(file || form.content.trim());
}

export function getComposerUiState({
  form,
  selectedTopic = null,
  globalDragging = false,
  metaOpen = false,
}) {
  const topicMode = isTopicCreateType(form.convert);
  const ttlValue = form.ttl.trim();
  return {
    editorPlaceholder: topicMode ? 'Input a valid topic name' : '',
    pathInputVisible: !topicMode,
    pathPlaceholder: selectedTopic ? 'relative/path' : 'custom/url/slug',
    showMetaToggle: !globalDragging,
    metaVisible: metaOpen,
    topicPrefix: topicMode ? '/' : (selectedTopic ? `${selectedTopic.path}/` : '/'),
    ttlDisabled: topicMode,
    ttlPlaceholder: 'never expires',
    ttlSuffixVisible: Boolean(ttlValue) && !topicMode,
  };
}
