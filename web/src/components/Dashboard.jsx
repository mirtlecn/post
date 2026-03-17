import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { sortItems } from '../config.js';
import { icons } from '../icons/Icons.jsx';
import { filterDashboardItems, TOPIC_STORAGE_KEY } from '../lib/topic-filter.js';
import { useToast } from '../hooks/useToast.js';
import { CreatePanel } from './CreatePanel.jsx';
import { IconButton } from './IconButton.jsx';
import { ListPanel } from './ListPanel.jsx';
import { ResultPanel } from './ResultPanel.jsx';
import { ToastLayer } from './ToastLayer.jsx';

export function Dashboard({ onLogout }) {
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [selectedTopicPath, setSelectedTopicPath] = useState('');
  const [composerType, setComposerType] = useState('none');
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
      await apiRequest({ method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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

  const created = useCallback(async (payload) => {
    setResult(payload);
    setPage(1);
    await loadItems();
  }, [loadItems]);

  const refreshPage = useCallback(async () => {
    setPage(1);
    await loadItems();
  }, [loadItems]);

  const topics = useMemo(() => items.filter((item) => item.type === 'topic'), [items]);
  const filteredItems = useMemo(
    () => filterDashboardItems(items, { selectedTopicPath, createType: composerType }),
    [items, selectedTopicPath, composerType],
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
    setPage(1);
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-5 py-6">
      <header className="panel-box mb-6 flex items-center justify-between">
        <button className="dashboard-title text-5xl font-black" onClick={refreshPage} type="button">
          Post
        </button>
        <div className="flex gap-2">
          <IconButton icon={icons.logout} onClick={onLogout} title="Logout" />
        </div>
      </header>
      <CreatePanel
        notify={showToast}
        onCreated={created}
        onModeChange={setComposerType}
        selectedTopicPath={selectedTopicPath}
        onTopicChange={handleTopicChange}
        topics={topics}
      />
      <div className="my-6">
        <ResultPanel onCopy={copy} result={result} />
      </div>
      {itemsLoading ? (
        <section className="panel-box">
          <div className="mb-4 h-5 w-24 skeleton" />
          <div className="rounded-[1.5rem] border border-base-300/70 p-4">
            <div className="mb-4 grid grid-cols-5 gap-4">
              <div className="h-5 skeleton" />
              <div className="h-5 skeleton" />
              <div className="h-5 skeleton" />
              <div className="h-5 skeleton" />
              <div className="h-5 skeleton" />
            </div>
            <div className="space-y-3">
              <div className="h-14 skeleton" />
              <div className="h-14 skeleton" />
              <div className="h-14 skeleton" />
            </div>
          </div>
        </section>
      ) : (
        filteredItems.length > 0 && <ListPanel items={filteredItems} onCopy={copy} onDelete={remove} page={page} setPage={setPage} />
      )}
      <ToastLayer onClose={clearToast} toast={toast} />
    </section>
  );
}
