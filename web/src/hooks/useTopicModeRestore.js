import { useState } from 'react';
import { TOPIC_CREATE_TYPE } from '../lib/composer-mode.js';

export function useTopicModeRestore({ composer, metaOpen, setMetaOpen, clearNativeFileInput }) {
  const [topicModeSnapshot, setTopicModeSnapshot] = useState(null);

  function restoreAfterTopicMode(nextConvert = null) {
    const snapshot = topicModeSnapshot;
    composer.restoreForm(snapshot);
    setMetaOpen(snapshot?.metaOpen ?? false);
    setTopicModeSnapshot(null);
    if (nextConvert) {
      composer.updateFormValue('convert', nextConvert);
    }
  }

  function onConvertSelect(nextConvert, closeMenu) {
    closeMenu();

    if (nextConvert === TOPIC_CREATE_TYPE) {
      if (!composer.isTopicMode) {
        setTopicModeSnapshot({
          ...composer.form,
          metaOpen,
        });
      }
      composer.enterTopicMode();
      setMetaOpen(true);
      clearNativeFileInput();
      return;
    }

    if (composer.isTopicMode) {
      restoreAfterTopicMode(nextConvert);
      return;
    }

    composer.updateFormValue('convert', nextConvert);
  }

  async function submit(event) {
    const submittedInTopicMode = composer.isTopicMode;
    const didSubmit = await composer.submit(event, {
      resetForm: submittedInTopicMode ? topicModeSnapshot : undefined,
    });

    if (!didSubmit || !submittedInTopicMode) {
      return didSubmit;
    }

    setMetaOpen(topicModeSnapshot?.metaOpen ?? false);
    setTopicModeSnapshot(null);
    return didSubmit;
  }

  return {
    onConvertSelect,
    submit,
    topicModeSnapshot,
  };
}
