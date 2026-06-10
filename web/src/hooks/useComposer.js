import { useEffect, useMemo, useState } from 'react';
import { createRequest, updateFile, updateRequest, uploadFile } from '../lib/api.js';
import {
  buildFileUploadData,
  buildInitialForm,
  buildRestoredForm,
  buildTextRequestBody,
  buildTopicModeForm,
  canSubmitComposerForm,
  isTopicCreateType,
  normalizePathValue,
  normalizeTopicNameValue,
  normalizeTtlValue,
} from '../lib/composer-mode.js';

function isConflictError(error) {
  return error?.status === 409 && error?.payload?.code === 'conflict';
}

function confirmOverwrite(error) {
  const message = error?.payload?.message || 'Path already exists';
  return window.confirm(`${message}\n\nOverwrite it?`);
}

function getFileMeta(file) {
  if (!file) return null;
  const size = file.size < 1024 * 1024
    ? `${Math.max(1, Math.round(file.size / 102.4) / 10)} KB`
    : `${Math.round(file.size / 1024 / 102.4) / 10} MB`;
  return {
    name: file.name,
    size,
  };
}

export function useComposer({ notify, onCreated, selectedTopicPath = '', topics = [] }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(buildInitialForm(selectedTopicPath));
  const isTopicMode = isTopicCreateType(form.convert);
  const updateFormValue = (fieldName, fieldValue) =>
    setForm((currentForm) => ({ ...currentForm, [fieldName]: fieldValue }));

  useEffect(() => {
    setForm((currentForm) => {
      if (isTopicCreateType(currentForm.convert)) {
        return currentForm.topic === '' ? currentForm : { ...currentForm, topic: '' };
      }

      return currentForm.topic === selectedTopicPath
        ? currentForm
        : { ...currentForm, topic: selectedTopicPath, path: '' };
    });
  }, [selectedTopicPath]);

  async function submit(event, { resetForm } = {}) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = await submitMutation();
      await onCreated(payload);
      reset(resetForm);
      return true;
    } catch (error) {
      if (isConflictError(error)) {
        if (!confirmOverwrite(error)) {
          return false;
        }
        try {
          const payload = await submitMutation({ allowOverwrite: true });
          await onCreated(payload);
          reset(resetForm);
          return true;
        } catch (overwriteError) {
          notify('error', overwriteError.message);
          return false;
        }
      }
      notify('error', error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitMutation({ allowOverwrite = false } = {}) {
    return file ? submitFile({ allowOverwrite }) : submitText({ allowOverwrite });
  }

  async function submitFile({ allowOverwrite = false } = {}) {
    const data = buildFileUploadData(form, file);
    const payload = await (allowOverwrite ? updateFile(data) : uploadFile(data));
    notify('success', allowOverwrite ? 'Updated' : 'Uploaded');
    return payload;
  }

  async function submitText({ allowOverwrite = false } = {}) {
    if (!form.content.trim()) throw new Error('Content is required');
    const body = buildTextRequestBody(form);
    const request = allowOverwrite ? updateRequest : createRequest;
    const payload = await request({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    notify('success', allowOverwrite ? 'Updated' : 'Created');
    return payload;
  }

  function updatePath(value) {
    updateFormValue('path', normalizePathValue(value));
  }

  function updateTitle(value) {
    updateFormValue('title', value.slice(0, 120));
  }

  function updateCreatedDate(value) {
    updateFormValue('createdDate', value.slice(0, 10));
    if (!value) updateFormValue('createdTime', '');
  }

  function updateCreatedTime(value) {
    updateFormValue('createdTime', value.slice(0, 5));
  }

  function updateContent(value) {
    updateFormValue('content', isTopicCreateType(form.convert) ? normalizeTopicNameValue(value) : value);
  }

  function updateTtl(value) {
    updateFormValue('ttl', normalizeTtlValue(value));
  }

  function updateTopic(value) {
    updateFormValue('topic', value);
    updateFormValue('path', '');
  }

  function reset(nextForm) {
    setFile(null);
    setForm(nextForm ? buildRestoredForm(nextForm, selectedTopicPath) : buildInitialForm(selectedTopicPath));
  }

  function enterTopicMode() {
    setFile(null);
    setForm(buildTopicModeForm());
  }

  function restoreForm(snapshot) {
    setFile(null);
    setForm(buildRestoredForm(snapshot, selectedTopicPath));
  }

  function onShortcut(event) {
    if (isTopicCreateType(form.convert) && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Enter' || !event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (!canSubmit) return;
    submit(event);
  }

  const fileMeta = getFileMeta(file);
  const selectedTopic = useMemo(
    () => topics.find((item) => item.path === form.topic) || null,
    [form.topic, topics],
  );
  const canSubmit = canSubmitComposerForm({ busy, file, form });

  return {
    busy,
    canSubmit,
    enterTopicMode,
    file,
    fileMeta,
    form,
    isTopicMode,
    selectedTopic,
    onShortcut,
    reset,
    restoreForm,
    setFile,
    submit,
    updatePath,
    updateTitle,
    updateTopic,
    updateContent,
    updateFormValue,
    updateCreatedDate,
    updateCreatedTime,
    updateTtl,
  };
}
