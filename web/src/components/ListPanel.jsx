import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COPY_FEEDBACK_MS, DELETE_CONFIRM_MS, LIST_BATCH_SIZE } from '../config.js';
import { buildVisibleListItems, getItemTypeLabel } from '../lib/list-panel.js';
import { ListPanelRow } from './ListPanelRow.jsx';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table.jsx';

const LOAD_MORE_THRESHOLD_PX = 80;

export function ListPanel({ items, onCopy, onDelete, onEdit }) {
  const [confirmPath, setConfirmPath] = useState('');
  const [deletingPath, setDeletingPath] = useState('');
  const [copiedPath, setCopiedPath] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LIST_BATCH_SIZE);
  const listScrollRef = useRef(null);
  const loadMoreRef = useRef(null);
  const { hasMore, rows } = useMemo(() => buildVisibleListItems(items, visibleCount), [items, visibleCount]);
  const actionTooltip = isMobile ? 'left' : 'top';

  const loadMoreItems = useCallback(() => {
    setVisibleCount((currentCount) => Math.min(items.length, currentCount + LIST_BATCH_SIZE));
  }, [items.length]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (confirmPath && !items.some((item) => item.path === confirmPath)) setConfirmPath('');
    if (deletingPath && !items.some((item) => item.path === deletingPath)) setDeletingPath('');
    if (copiedPath && !items.some((item) => item.path === copiedPath)) setCopiedPath('');
  }, [items, confirmPath, deletingPath, copiedPath]);

  useEffect(() => {
    setVisibleCount(LIST_BATCH_SIZE);
  }, [items]);

  useEffect(() => {
    if (!copiedPath) return undefined;
    const timer = window.setTimeout(() => setCopiedPath(''), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copiedPath]);

  useEffect(() => {
    if (!confirmPath) return undefined;
    const timer = window.setTimeout(() => setConfirmPath(''), DELETE_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirmPath]);

  useEffect(() => {
    if (!confirmPath) return undefined;
    function onDocumentPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        setConfirmPath('');
        return;
      }
      const button = target.closest('[data-delete-btn="true"]');
      if (button?.getAttribute('data-path') === confirmPath) return;
      setConfirmPath('');
    }
    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [confirmPath]);

  async function confirmDelete(path) {
    if (deletingPath) return;
    if (confirmPath !== path) {
      setConfirmPath(path);
      return;
    }
    setDeletingPath(path);
    try {
      const item = items.find((entry) => entry.path === path);
      if (!item) return;
      await onDelete(item);
    } finally {
      setDeletingPath('');
      setConfirmPath('');
    }
  }

  async function copyLink(path, surl) {
    if (copiedPath) return;
    setConfirmPath('');
    const ok = await onCopy(surl);
    if (ok) setCopiedPath(path);
  }

  function handleListScroll(event) {
    if (!hasMore) return;
    const target = event.currentTarget;
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remainingScroll <= LOAD_MORE_THRESHOLD_PX) {
      loadMoreItems();
    }
  }

  useEffect(() => {
    if (!hasMore) return undefined;
    const root = listScrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || typeof window.IntersectionObserver !== 'function') return undefined;

    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreItems();
        }
      },
      { root, rootMargin: `${LOAD_MORE_THRESHOLD_PX}px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMoreItems, rows.length]);

  const tableClassName = isMobile ? 'list-table-mobile' : 'table-fixed';
  const pathColumnClassName = isMobile ? 'w-[10rem] max-w-[10rem]' : 'w-[18rem] max-w-[18rem]';
  const metaColumnClassName = isMobile ? 'w-[8.5rem] max-w-[8.5rem]' : 'w-[12rem] max-w-[12rem]';
  const actionColumnClassName = isMobile ? 'w-[10rem] text-right' : 'w-[13rem] text-right';
  const previewColumnClassName = isMobile ? 'min-w-[8rem] max-w-[10rem] truncate text-muted-foreground' : 'max-w-md truncate text-muted-foreground';

  return (
    <section className="list-panel-section pt-2">
      <div className="section-label mb-4">Links</div>
      <div
        className="list-scroll max-h-[30rem] overflow-auto rounded-lg border border-border"
        onScroll={handleListScroll}
        ref={listScrollRef}
      >
        <Table className={tableClassName}>
          <TableHeader>
            <TableRow>
              <TableHead className={pathColumnClassName}>Path</TableHead>
              <TableHead className={metaColumnClassName}>Meta</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead className={actionColumnClassName}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item) => (
              <ListPanelRow
                actionTooltip={actionTooltip}
                confirmPath={confirmPath}
                copiedPath={copiedPath}
                deletingPath={deletingPath}
                item={item}
                key={item.path}
                metaColumnClassName={metaColumnClassName}
                onConfirmDelete={confirmDelete}
                onCopyLink={copyLink}
                onEdit={onEdit}
                onOpenLink={(surl) => {
                  setConfirmPath('');
                  window.open(surl, '_blank', 'noreferrer');
                }}
                pathColumnClassName={pathColumnClassName}
                previewColumnClassName={previewColumnClassName}
                typeLabel={getItemTypeLabel(item.type)}
              />
            ))}
          </TableBody>
        </Table>
        {hasMore && <div aria-hidden="true" className="h-2" ref={loadMoreRef} />}
      </div>
    </section>
  );
}
