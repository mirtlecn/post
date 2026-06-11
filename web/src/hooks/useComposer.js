import { useEffect, useMemo, useState } from 'react';
import { completeUpload, prepareUpload, createRequest, updateRequest, uploadToS3 } from '../lib/api.js';
import {
  buildDirectUploadBody,
  buildFileMetadataRequestBody,
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

function getExistingFileMeta(existingFile) {
  if (!existingFile) return null;
  return {
    name: existingFile.name,
    metaItems: ['Current file'],
  };
}

export function useComposer({ notify, onCreated, selectedTopicPath = '', topics = [] }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [existingFile, setExistingFile] = useState(null);
  const [fileEditMode, setFileEditMode] = useState(false);
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
    if (file) {
      return submitFile({ allowOverwrite: allowOverwrite || fileEditMode, preservePath: fileEditMode });
    }
    if (existingFile) {
      return submitExistingFileMetadata();
    }

    return submitText({ allowOverwrite });
  }

  async function submitFile({ allowOverwrite = false, preservePath = false } = {}) {
    const fallbackMessage = allowOverwrite ? 'Update failed' : 'Upload failed';
    const body = buildDirectUploadBody(form, file, { preservePath, allowOverwrite });
    const prepared = await prepareUpload(body, fallbackMessage);
    await uploadToS3(prepared.uploadUrl, prepared.headers, file, fallbackMessage);
    const payload = await completeUpload(prepared.uploadId, fallbackMessage);
    notify('success', allowOverwrite ? 'Updated' : 'Uploaded');
    return payload;
  }

  async function submitExistingFileMetadata() {
    const body = buildFileMetadataRequestBody(form);
    const payload = await updateRequest({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    notify('success', 'Updated');
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

  function selectFile(nextFile) {
    setFile(nextFile);
    if (nextFile) setExistingFile(null);
  }

  function clearSelectedFile() {
    if (fileEditMode) {
      setFile(null);
      setExistingFile(null);
      return;
    }

    reset();
  }

  function reset(nextForm) {
    setFile(null);
    setExistingFile(null);
    setFileEditMode(false);
    setForm(nextForm ? buildRestoredForm(nextForm, selectedTopicPath) : buildInitialForm(selectedTopicPath));
  }

  function enterTopicMode() {
    setFile(null);
    setExistingFile(null);
    setFileEditMode(false);
    setForm(buildTopicModeForm());
  }

  function restoreForm(snapshot) {
    setFile(null);
    setExistingFile(snapshot?.existingFile || null);
    setFileEditMode(Boolean(snapshot?.existingFile));
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

  const fileMeta = file ? getFileMeta(file) : getExistingFileMeta(existingFile);
  const selectedTopic = useMemo(
    () => topics.find((item) => item.path === form.topic) || null,
    [form.topic, topics],
  );
  const canSubmit = canSubmitComposerForm({ busy, existingFile, file, fileEditMode, form });
  const isFileMode = Boolean(file || existingFile || fileEditMode);

  return {
    busy,
    canSubmit,
    clearSelectedFile,
    enterTopicMode,
    existingFile,
    file,
    fileEditMode,
    fileMeta,
    form,
    isFileMode,
    isTopicMode,
    selectedTopic,
    onShortcut,
    reset,
    restoreForm,
    setFile: selectFile,
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
