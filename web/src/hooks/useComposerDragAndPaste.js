import { useEffect, useRef, useState } from 'react';
import { getImageFileFromClipboard } from '../lib/clipboard.js';

function hasFiles(event) {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes('Files');
}

export function useComposerDragAndPaste({ disabled, onSelectFile }) {
  const [globalDragging, setGlobalDragging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const globalDragDepthRef = useRef(0);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!disabled) return undefined;
    globalDragDepthRef.current = 0;
    setGlobalDragging(false);
    setDragging(false);
    return undefined;
  }, [disabled]);

  useEffect(() => {
    function onWindowDragEnter(event) {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      globalDragDepthRef.current += 1;
      setGlobalDragging(true);
    }

    function onWindowDragOver(event) {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setGlobalDragging(true);
    }

    function onWindowDragLeave(event) {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      globalDragDepthRef.current = Math.max(0, globalDragDepthRef.current - 1);
      if (globalDragDepthRef.current === 0) {
        setGlobalDragging(false);
        setDragging(false);
      }
    }

    function onWindowDrop(event) {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      globalDragDepthRef.current = 0;
      setGlobalDragging(false);
      setDragging(false);
    }

    window.addEventListener('dragenter', onWindowDragEnter);
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('dragenter', onWindowDragEnter);
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('dragleave', onWindowDragLeave);
      window.removeEventListener('drop', onWindowDrop);
    };
  }, [disabled]);

  function resetDragging() {
    globalDragDepthRef.current = 0;
    setGlobalDragging(false);
    setDragging(false);
  }

  function clearSelectedFile() {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function openPicker() {
    if (disabled) return;
    fileInputRef.current?.click();
  }

  function onDragEnter(event) {
    if (disabled || !hasFiles(event)) return;
    event.preventDefault();
    setDragging(true);
  }

  function onDragLeave(event) {
    if (disabled || !hasFiles(event)) return;
    event.preventDefault();
    setDragging(false);
  }

  function onDragOver(event) {
    if (disabled || !hasFiles(event)) return;
    event.preventDefault();
    setDragging(true);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function onDrop(event) {
    if (disabled || !hasFiles(event)) return;
    event.preventDefault();
    resetDragging();
    onSelectFile(event.dataTransfer.files?.[0] || null);
  }

  function onPaste(event) {
    if (disabled) return;

    const imageFile = getImageFileFromClipboard(event.clipboardData);
    if (!imageFile) return;

    event.preventDefault();
    onSelectFile(imageFile);
  }

  function onFileInputChange(event) {
    onSelectFile(event.target.files?.[0] || null);
  }

  return {
    clearSelectedFile,
    dragging,
    fileInputRef,
    globalDragging,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
    onFileInputChange,
    onPaste,
    openPicker,
    textareaRef,
  };
}
