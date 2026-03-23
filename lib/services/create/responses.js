import { buildPublicLink } from '../../utils/link-path.js';
import { getDomain, parseStoredValue, resolveStoredCreated } from '../../utils/storage.js';
import { buildCreatedEntryPayload } from '../link-entry.js';
import { TOPIC_TYPE } from '../topic-store.js';

export function buildTopicResponsePayload(req, topicPath, itemCount, title) {
  return {
    surl: buildPublicLink(getDomain(req), topicPath),
    path: topicPath,
    type: TOPIC_TYPE,
    title,
    created: 'illegal',
    content: String(itemCount),
    ttl: null,
  };
}

export function buildCreateConflictPayload({
  req,
  path,
  existingStoredValue,
  isExport,
  existingExpiresIn = null,
}) {
  const existingEntry = parseStoredValue(existingStoredValue);
  return {
    code: 'conflict',
    message: `path "${path}" already exists`,
    hint: 'Use PUT to overwrite',
    details: {
      existing: buildCreatedEntryPayload({
        req,
        path,
        type: existingEntry.type,
        content: existingEntry.content,
        title: existingEntry.title,
        created: existingEntry.created,
        isExport,
        expiresIn: existingExpiresIn,
        overwrittenStoredValue: null,
        ttlWarning: null,
      }),
    },
  };
}

export function buildCreateSuccessPayload({
  req,
  path,
  type,
  content,
  title,
  created,
  isExport,
  expiresIn,
  overwrittenStoredValue,
  ttlWarning,
}) {
  return buildCreatedEntryPayload({
    req,
    path,
    type,
    content,
    title,
    created,
    isExport,
    expiresIn,
    overwrittenStoredValue,
    ttlWarning,
  });
}

export function buildTopicMutationSuccessPayload({
  req,
  path,
  itemCount,
  title,
  storedCreated,
}) {
  return {
    ...buildTopicResponsePayload(req, path, itemCount, title),
    created: resolveStoredCreated(storedCreated).created,
  };
}
