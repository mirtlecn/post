import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, deleteRequest, lookupItem } from '../lib/api.js';
import { sortItems } from '../config.js';
import { icons } from '../icons/Icons.jsx';
import { buildEditComposerSnapshot } from '../lib/composer-mode.js';
import { filterDashboardItems, TOPIC_STORAGE_KEY } from '../lib/topic-filter.js';
import { useToast } from '../hooks/useToast.js';
import { CreatePanel } from './CreatePanel.jsx';
import { IconButton } from './IconButton.jsx';
import { ListPanel } from './ListPanel.jsx';
import { ResultPanel } from './ResultPanel.jsx';
import { ToastLayer } from './ToastLayer.jsx';
import { Button } from './ui/button.jsx';
import { Card, CardContent } from './ui/card.jsx';
import { Skeleton } from './ui/skeleton.jsx';

export function Dashboard({ onLogout }) {
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [selectedTopicPath, setSelectedTopicPath] = useState('');
  const [composerFilters, setComposerFilters] = useState({ path: '', ttl: '', type: 'none' });
  const [editRequest, setEditRequest] = useState(null);
  const [editLoadingPath, setEditLoadingPath] = useState('');
  const [resetRequestId, setResetRequestId] = useState(0);
  const [listResetKey, setListResetKey] = useState(0);
  const { toast, showToast, clearToast } = useToast();

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      setItems(sortItems(await apiRequest()));
    } catch (error) {
      showToast('error', error.message);
    } finally {
      setItemsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    const storedTopicPath = window.localStorage.getItem(TOPIC_STORAGE_KEY) || '';
    setSelectedTopicPath(storedTopicPath);
  }, []);

  const remove = useCallback(async (item) => {
    try {
      const body = { path: item.path };
      if (item.type === 'topic') body.type = 'topic';
      await deleteRequest({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setItems((v) => v.filter((entry) => entry.path !== item.path));
      showToast('success', 'Deleted');
    } catch (error) {
      showToast('error', error.message);
    }
  }, [showToast]);

  const copy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', 'Copied');
      return true;
    } catch {
      showToast('error', 'Copy failed');
      return false;
    }
  }, [showToast]);

  const topics = useMemo(() => items.filter((item) => item.type === 'topic'), [items]);

  const edit = useCallback(async (item) => {
    setEditLoadingPath(item.path);
    try {
      const fullItem = await lookupItem(item.path, item.type === 'topic' ? 'topic' : '');
      const snapshot = buildEditComposerSnapshot(fullItem, topics);
      setItems((currentItems) => sortItems(currentItems.map((entry) => (
        entry.path === fullItem.path ? { ...entry, ...fullItem } : entry
      ))));
      setSelectedTopicPath(snapshot.topic);
      setEditRequest({ id: `${fullItem.path}:${Date.now()}`, snapshot });
    } catch (error) {
      showToast('error', error.message);
    } finally {
      setEditLoadingPath('');
    }
  }, [showToast, topics]);

  const created = useCallback(async (payload) => {
    setResult(payload);
    setComposerFilters({ path: '', ttl: '', type: 'none' });
    await loadItems();
  }, [loadItems]);

  const refreshPage = useCallback(async () => {
    await loadItems();
  }, [loadItems]);

  const resetDashboard = useCallback(() => {
    setResult(null);
    setSelectedTopicPath('');
    setComposerFilters({ path: '', ttl: '', type: 'none' });
    setEditRequest(null);
    setEditLoadingPath('');
    setResetRequestId((currentId) => currentId + 1);
    setListResetKey((currentKey) => currentKey + 1);
    clearToast();
    window.localStorage.removeItem(TOPIC_STORAGE_KEY);
  }, [clearToast]);

  const filteredItems = useMemo(
    () => filterDashboardItems(items, {
      selectedTopicPath,
      createType: composerFilters.type,
      pathFilter: composerFilters.path,
      ttlFilter: composerFilters.ttl,
    }),
    [items, selectedTopicPath, composerFilters],
  );

  useEffect(() => {
    if (!selectedTopicPath) {
      window.localStorage.removeItem(TOPIC_STORAGE_KEY);
      return;
    }

    const topicExists = topics.some((item) => item.path === selectedTopicPath);
    if (!topicExists) {
      setSelectedTopicPath('');
      window.localStorage.removeItem(TOPIC_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(TOPIC_STORAGE_KEY, selectedTopicPath);
  }, [selectedTopicPath, topics]);

  const handleTopicChange = useCallback((nextTopicPath) => {
    setSelectedTopicPath(nextTopicPath);
  }, []);

  const handleComposerFilterChange = useCallback((nextFilters) => {
    setComposerFilters((currentFilters) => ({ ...currentFilters, ...nextFilters }));
  }, []);

  return (
    <section className="dashboard-shell mx-auto max-w-6xl px-5 py-6">
      <Card className="mb-6">
        <CardContent className="flex items-center justify-between">
          <Button className="dashboard-title h-auto p-0 text-5xl font-black" onClick={refreshPage} type="button" variant="ghost">
            Post
          </Button>
          <div className="flex gap-2">
            <IconButton icon={icons.close} onClick={resetDashboard} title="Clear" />
            <IconButton className="text-destructive hover:bg-destructive/10" icon={icons.logout} onClick={onLogout} title="Logout" />
          </div>
        </CardContent>
      </Card>
      {result ? (
        <div className="mb-6">
          <ResultPanel onCopy={copy} result={result} />
        </div>
      ) : null}
      <Card className="dashboard-main-card">
        <CardContent className="grid gap-6">
          <CreatePanel
            notify={showToast}
            editRequest={editRequest}
            editLoading={Boolean(editLoadingPath)}
            onCreated={created}
            onFilterChange={handleComposerFilterChange}
            resetRequestId={resetRequestId}
            selectedTopicPath={selectedTopicPath}
            onTopicChange={handleTopicChange}
            topics={topics}
          />
          {itemsLoading ? (
            <section className="pt-2">
              <Skeleton className="mb-4 h-5 w-24" />
              <div className="rounded-lg border border-border p-4">
                <div className="mb-4 grid grid-cols-5 gap-4">
                  <Skeleton className="h-5" />
                  <Skeleton className="h-5" />
                  <Skeleton className="h-5" />
                  <Skeleton className="h-5" />
                  <Skeleton className="h-5" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              </div>
            </section>
          ) : (
            filteredItems.length > 0 && <ListPanel items={filteredItems} key={listResetKey} onCopy={copy} onDelete={remove} onEdit={edit} />
          )}
        </CardContent>
      </Card>
      <ToastLayer onClose={clearToast} toast={toast} />
    </section>
  );
}
