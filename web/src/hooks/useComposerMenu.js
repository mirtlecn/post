import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { computeSelectMenuPosition } from '../lib/select-menu-position.js';

export function useComposerMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const menuPanelRef = useRef(null);
  const syncMenuPositionRef = useRef(() => {});

  useEffect(() => {
    if (!menuOpen) return undefined;

    function onPointerDown(event) {
      const target = event.target;
      if (target instanceof Element && (menuRef.current?.contains(target) || menuPanelRef.current?.contains(target))) {
        return;
      }

      setMenuOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return undefined;
    }

    function syncMenuPosition() {
      const button = menuButtonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      setMenuPosition(computeSelectMenuPosition({
        rect,
        menuHeight: menuPanelRef.current?.offsetHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }));
    }

    syncMenuPositionRef.current = syncMenuPosition;
    syncMenuPosition();
    window.addEventListener('resize', syncMenuPosition);
    window.addEventListener('scroll', syncMenuPosition, true);
    return () => {
      syncMenuPositionRef.current = () => {};
      window.removeEventListener('resize', syncMenuPosition);
      window.removeEventListener('scroll', syncMenuPosition, true);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) return undefined;

    const frame = window.requestAnimationFrame(() => {
      syncMenuPositionRef.current();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen]);

  return {
    menuButtonRef,
    menuOpen,
    menuPanelRef,
    menuPosition,
    menuRef,
    setMenuOpen,
  };
}
