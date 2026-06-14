import { useEffect, useRef, useState } from 'react';
import { ComposerEditor } from './ComposerEditor.jsx';
import { ComposerMetaFields } from './ComposerMetaFields.jsx';
import { ComposerToolbar } from './ComposerToolbar.jsx';
import { useComposer } from '../hooks/useComposer.js';
import { useComposerDragAndPaste } from '../hooks/useComposerDragAndPaste.js';
import { useTopicModeRestore } from '../hooks/useTopicModeRestore.js';
import { formatTopicLabel, getComposerUiState, resolveTtlMinutes } from '../lib/composer-mode.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog.jsx';

export function CreatePanel(props) {
  const composer = useComposer(props);
  const [topicOpen, setTopicOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(() => Boolean(props.initialMetaOpen));
  const [ttlFocused, setTtlFocused] = useState(false);
  const panelRef = useRef(null);
  const dragAndPaste = useComposerDragAndPaste({
    disabled: composer.isTopicMode || props.editLoading,
    onSelectFile: composer.setFile,
  });
  const topicMode = useTopicModeRestore({
    clearNativeFileInput: dragAndPaste.clearSelectedFile,
    composer,
    metaOpen,
    setMetaOpen,
  });
  const topicPrefixLabel = composer.isTopicMode
    ? '/'
    : formatTopicLabel(composer.selectedTopic?.path || '');
  const topicPrefixLabelBody = topicPrefixLabel === '/' ? '' : topicPrefixLabel.slice(0, -1);
  const uiState = getComposerUiState({
    form: composer.form,
    selectedTopic: composer.selectedTopic,
    globalDragging: dragAndPaste.globalDragging,
    metaOpen,
  });
  const {
    editorPlaceholder,
    pathInputVisible,
    pathPlaceholder,
    showMetaToggle,
    metaVisible,
    topicPrefix,
    ttlDisabled,
    ttlPlaceholder,
    ttlSuffixVisible,
  } = uiState;
  const effectiveTtlPlaceholder = ttlFocused && !composer.form.ttl.trim() ? '60*24' : ttlPlaceholder;
  const effectiveTtlSuffixVisible = ttlFocused || ttlSuffixVisible;

  useEffect(() => {
    props.onModeChange?.(composer.form.convert);
    props.onFilterChange?.({ type: composer.form.convert });
  }, [composer.form.convert, props.onModeChange]);

  useEffect(() => {
    props.onDraftChange?.(composer.hasDraft);
  }, [composer.hasDraft, props.onDraftChange]);

  useEffect(() => () => props.onDraftChange?.(false), [props.onDraftChange]);

  useEffect(() => {
    if (!composer.isTopicMode) return;
    setTtlFocused(false);
  }, [composer.isTopicMode]);

  useEffect(() => {
    if (!ttlDisabled) return;
    setTtlFocused(false);
  }, [ttlDisabled]);

  useEffect(() => {
    if (!props.resetRequestId) return;

    composer.reset();
    setMetaOpen(false);
    setTtlFocused(false);
    setTopicOpen(false);
    topicMode.clearTopicModeSnapshot();
    dragAndPaste.clearSelectedFile();
  }, [props.resetRequestId]);

  useEffect(() => {
    if (!props.editRequest) return;

    const { snapshot } = props.editRequest;
    composer.restoreForm(snapshot);
    setMetaOpen(false);
    setTtlFocused(false);
    props.onFilterChange?.({
      path: snapshot.path,
      ttl: snapshot.ttl,
      type: snapshot.convert,
    });
    if (snapshot.topic !== props.selectedTopicPath) {
      props.onTopicChange?.(snapshot.topic);
    }
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [props.editRequest?.id]);

  function clearSelectedFile() {
    const wasFileEditMode = composer.fileEditMode;
    composer.clearSelectedFile();
    if (!wasFileEditMode) props.onFilterChange?.({ path: '', ttl: '', type: 'none' });
    dragAndPaste.clearSelectedFile();
  }

  function onTopicChange(nextTopicPath) {
    if (composer.isTopicMode) return;

    if (nextTopicPath) setMetaOpen(true);
    composer.updateTopic(nextTopicPath);
    props.onFilterChange?.({ path: '' });
    props.onTopicChange?.(nextTopicPath);
    setTopicOpen(false);
  }

  async function onSubmit(event) {
    if (props.editLoading) {
      event.preventDefault();
      return;
    }
    await topicMode.submit(event);
  }

  async function onOverwriteConfirm(event) {
    event.preventDefault();

    const submittedInTopicMode = composer.pendingOverwrite?.submittedInTopicMode;
    const didSubmit = await composer.confirmOverwrite();
    if (didSubmit && submittedInTopicMode) {
      topicMode.completeTopicSubmit();
    }
  }

  function onConvertSelect(nextConvert) {
    const restoredSnapshot = composer.isTopicMode ? topicMode.topicModeSnapshot : null;
    topicMode.onConvertSelect(nextConvert);

    if (nextConvert === 'topic') {
      props.onFilterChange?.({ path: '', ttl: '', type: nextConvert });
      return;
    }

    if (restoredSnapshot) {
      props.onFilterChange?.({
        path: restoredSnapshot.path || '',
        ttl: restoredSnapshot.ttl || '',
        type: nextConvert,
      });
      return;
    }

    props.onFilterChange?.({ type: nextConvert });
  }

  return (
    <section className="composer-panel" ref={panelRef}>
      <div className="section-label mb-4">New</div>
      <form className="grid gap-3 animate-fade-up" onSubmit={onSubmit}>
        <ComposerEditor
          contentValue={composer.form.content}
          dragging={dragAndPaste.dragging}
          editorPlaceholder={editorPlaceholder}
          fileInputRef={dragAndPaste.fileInputRef}
          fileMeta={composer.fileMeta}
          fileMode={composer.isFileMode}
          globalDragging={dragAndPaste.globalDragging}
          isTopicMode={composer.isTopicMode}
          loading={props.editLoading}
          metaFields={(
            <ComposerMetaFields
              createdDateValue={composer.form.createdDate}
              createdTimeValue={composer.form.createdTime}
              metaVisible={metaVisible}
              onCreatedDateChange={composer.updateCreatedDate}
              onCreatedTimeChange={composer.updateCreatedTime}
              onTitleChange={composer.updateTitle}
              onToggleMeta={() => setMetaOpen((value) => !value)}
              showMetaToggle={showMetaToggle}
              titleValue={composer.form.title}
            />
          )}
          metaVisible={metaVisible}
          onClearSelectedFile={clearSelectedFile}
          onContentChange={composer.updateContent}
          onDragEnter={dragAndPaste.onDragEnter}
          onDragLeave={dragAndPaste.onDragLeave}
          onDragOver={dragAndPaste.onDragOver}
          onDrop={dragAndPaste.onDrop}
          onFileInputChange={dragAndPaste.onFileInputChange}
          onOpenPicker={dragAndPaste.openPicker}
          onPaste={dragAndPaste.onPaste}
          onShortcut={composer.onShortcut}
          textareaRef={dragAndPaste.textareaRef}
        />
        <ComposerToolbar
          busy={composer.busy}
          canSubmit={!props.editLoading && composer.canSubmit}
          effectiveTtlPlaceholder={effectiveTtlPlaceholder}
          effectiveTtlSuffixVisible={effectiveTtlSuffixVisible}
          fileMode={composer.isFileMode}
          form={composer.form}
          isTopicMode={composer.isTopicMode}
          onConvertSelect={onConvertSelect}
          onPathBlur={() => props.onFilterChange?.({ path: composer.form.path })}
          onPathChange={composer.updatePath}
          pathLocked={composer.fileEditMode}
          onTopicChange={onTopicChange}
          onTopicOpenChange={setTopicOpen}
          onTtlBlur={() => {
            setTtlFocused(false);
            const ttl = resolveTtlMinutes(composer.form.ttl);
            props.onFilterChange?.({ ttl: ttl === null ? '' : String(ttl) });
          }}
          onTtlChange={composer.updateTtl}
          onTtlFocus={() => setTtlFocused(true)}
          pathInputVisible={pathInputVisible}
          pathPlaceholder={pathPlaceholder}
          selectedTopicLabel={topicPrefixLabelBody}
          topicOpen={topicOpen}
          topicPrefix={topicPrefix}
          topics={props.topics}
          ttlDisabled={ttlDisabled}
        />
      </form>
      <AlertDialog
        open={Boolean(composer.pendingOverwrite)}
        onOpenChange={(open) => {
          if (!open) composer.cancelOverwrite();
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the existing item and keeps the same public link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={composer.busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={composer.busy} onClick={onOverwriteConfirm}>
              {composer.busy ? 'Overwriting...' : 'Overwrite'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
