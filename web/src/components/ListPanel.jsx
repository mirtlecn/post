import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COPY_FEEDBACK_MS, LIST_BATCH_SIZE } from '../config.js';
import { buildVisibleListItems, getItemTypeLabel } from '../lib/list-panel.js';
import { ListPanelRow } from './ListPanelRow.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table.jsx';

const LOAD_MORE_THRESHOLD_PX = 80;
const SKELETON_ROW_COUNT = 4;

function ListPanelSkeletonRows({ actionColumnClassName, metaColumnClassName, pathColumnClassName }) {
  return Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
    <TableRow key={index}>
      <TableCell className={pathColumnClassName}>
        <Skeleton className="mb-2 h-4 w-4/5" />
        <Skeleton className="h-3 w-2/5" />
      </TableCell>
      <TableCell className={metaColumnClassName}>
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="h-3 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-full" />
      </TableCell>
      <TableCell className={actionColumnClassName}>
        <Skeleton className="ml-auto size-7 rounded-md" />
      </TableCell>
    </TableRow>
  ));
}

export function ListPanel({ items, loading = false, onCopy, onDelete, onEdit }) {
  const [deletingPath, setDeletingPath] = useState('');
  const [copiedPath, setCopiedPath] = useState('');
  const [visibleCount, setVisibleCount] = useState(LIST_BATCH_SIZE);
  const listScrollRef = useRef(null);
  const loadMoreRef = useRef(null);
  const { hasMore, rows } = useMemo(() => buildVisibleListItems(items, visibleCount), [items, visibleCount]);

  const loadMoreItems = useCallback(() => {
    setVisibleCount((currentCount) => Math.min(items.length, currentCount + LIST_BATCH_SIZE));
  }, [items.length]);

  useEffect(() => {
    if (deletingPath && !items.some((item) => item.path === deletingPath)) setDeletingPath('');
    if (copiedPath && !items.some((item) => item.path === copiedPath)) setCopiedPath('');
  }, [items, deletingPath, copiedPath]);

  useEffect(() => {
    setVisibleCount(LIST_BATCH_SIZE);
  }, [items]);

  useEffect(() => {
    if (!copiedPath) return undefined;
    const timer = window.setTimeout(() => setCopiedPath(''), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copiedPath]);

  async function deleteItem(path) {
    if (deletingPath) return;
    setDeletingPath(path);
    try {
      const item = items.find((entry) => entry.path === path);
      if (!item) return;
      await onDelete(item);
    } finally {
      setDeletingPath('');
    }
  }

  async function copyLink(path, surl) {
    if (copiedPath) return;
    const ok = await onCopy(surl);
    if (ok) setCopiedPath(path);
  }

  function handleListScroll(event) {
    if (loading || !hasMore) return;
    const target = event.currentTarget;
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remainingScroll <= LOAD_MORE_THRESHOLD_PX) {
      loadMoreItems();
    }
  }

  useEffect(() => {
    if (loading || !hasMore) return undefined;
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
  }, [hasMore, loadMoreItems, loading, rows.length]);

  const tableClassName = 'min-w-[48rem] table-fixed';
  const pathColumnClassName = 'w-[18rem] max-w-[18rem]';
  const metaColumnClassName = 'w-[12rem] max-w-[12rem]';
  const actionColumnClassName = 'w-16 text-right';
  const headClassName = 'sticky top-0 z-10 bg-card';
  const previewColumnClassName = 'max-w-md truncate text-muted-foreground';

  return (
    <section className="list-panel-section pt-2">
      <div className="section-label mb-4">Links</div>
      <div
        className="list-scroll max-h-[30rem] overflow-auto rounded-lg border border-border [&>[data-slot=table-container]]:overflow-visible"
        onScroll={handleListScroll}
        ref={listScrollRef}
      >
        <Table className={tableClassName}>
          <TableHeader>
            <TableRow>
              <TableHead className={`${headClassName} ${pathColumnClassName}`}>Path</TableHead>
              <TableHead className={`${headClassName} ${metaColumnClassName}`}>Info</TableHead>
              <TableHead className={headClassName}>Preview</TableHead>
              <TableHead className={`${headClassName} ${actionColumnClassName}`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <ListPanelSkeletonRows
                actionColumnClassName={actionColumnClassName}
                metaColumnClassName={metaColumnClassName}
                pathColumnClassName={pathColumnClassName}
              />
            ) : rows.map((item) => (
              <ListPanelRow
                copiedPath={copiedPath}
                deletingPath={deletingPath}
                item={item}
                key={item.path}
                metaColumnClassName={metaColumnClassName}
                onCopyLink={copyLink}
                onDeleteItem={deleteItem}
                onEdit={onEdit}
                onOpenLink={(surl) => window.open(surl, '_blank', 'noreferrer')}
                pathColumnClassName={pathColumnClassName}
                previewColumnClassName={previewColumnClassName}
                typeLabel={getItemTypeLabel(item.type)}
              />
            ))}
          </TableBody>
        </Table>
        {!loading && hasMore && <div aria-hidden="true" className="h-2" ref={loadMoreRef} />}
      </div>
    </section>
  );
}
