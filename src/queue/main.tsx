import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_SETTINGS,
  itemsForView,
  markDone,
  markUnread,
  moveToTrash,
  searchItems,
  restoreFromTrash,
  stateOf,
  type QueueView,
  type ReadingItem,
  type Settings,
} from "../domain";
import { sendMessage } from "../chrome";
import { getItems, getSettings, removeItem, setItems as persistItems, setSettings as persistSettings } from "../repository";
import "./queue.css";

const VIEWS: Array<{ id: QueueView; label: string }> = [
  { id: "unread", label: "全部未读" },
  { id: "today", label: "今天" },
  { id: "week", label: "本周" },
  { id: "source", label: "按来源" },
  { id: "done", label: "已完成" },
  { id: "trash", label: "废纸篓" },
];

function NavIcon({ view }: { view: QueueView | "settings" }) {
  const paths: Record<QueueView | "settings", React.ReactNode> = {
    unread: <><rect x="4" y="3" width="12" height="14" rx="2" /><path d="M8 7h4M8 10h5M8 13h3" /></>,
    today: <><path d="m10 2 2.1 2.2 3 .4.4 3L18 10l-2.5 2.4-.4 3-3 .4L10 18l-2.1-2.2-3-.4-.4-3L2 10l2.5-2.4.4-3 3-.4L10 2Z" /><path d="M10 6v4l2 1" /></>,
    week: <><rect x="3" y="5" width="14" height="12" rx="2" /><path d="M6 3v4M14 3v4M3 9h14M7 12h2M11 12h2" /></>,
    source: <><circle cx="6" cy="6" r="3" /><circle cx="14" cy="6" r="3" /><circle cx="6" cy="14" r="3" /><path d="M12 12h5v5h-5z" /></>,
    done: <><path d="M4 10.5 8 14l8-8" /><rect x="3" y="3" width="14" height="14" rx="2" /></>,
    trash: <><path d="M4 6h12M8 3h4l1 3M6 6l1 11h6l1-11M9 9v5M11 9v5" /></>,
    settings: <><circle cx="10" cy="10" r="3" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 20 20" aria-hidden="true">{paths[view]}</svg>;
}

function relativeDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (date.getTime() >= today) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date.getTime() >= today - day) return "昨天";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function SiteIcon({ item }: { item: ReadingItem }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="site-favicon fallback" aria-hidden="true">{item.domain.charAt(0).toUpperCase()}</div>;

  const favicon = new URL(chrome.runtime.getURL("/_favicon/"));
  favicon.searchParams.set("pageUrl", item.url);
  favicon.searchParams.set("size", "32");
  return <img className="site-favicon" src={favicon.href} alt="" onError={() => setFailed(true)} />;
}

function QueueItem({ item, onChange }: { item: ReadingItem; onChange: (next: ReadingItem | null) => void }) {
  const state = stateOf(item);

  async function update(transform: (value: ReadingItem) => ReadingItem) {
    const all = await getItems();
    const nextItem = transform(item);
    await persistItems(all.map((candidate) => candidate.id === item.id ? nextItem : candidate));
    onChange(nextItem);
  }

  function open() {
    void sendMessage({ type: "OPEN_ITEM", url: item.url });
  }

  return (
    <article className="queue-item" tabIndex={0} onClick={open} onKeyDown={(event) => {
      if (event.key === "Enter") open();
    }}>
      <button
        className={state === "done" ? "check checked" : "check"}
        title={state === "done" ? "恢复未读" : "标记完成"}
        aria-label={state === "done" ? "恢复未读" : "标记完成"}
        onClick={(event) => {
          event.stopPropagation();
          void update(state === "done" ? markUnread : markDone);
        }}
        disabled={state === "trash"}
      >{state === "done" ? "✓" : ""}</button>
      <SiteIcon item={item} />
      <div className="item-body">
        {item.note && <p className="item-note">{item.note}</p>}
        <div className="item-detail-row">
          <div className="item-heading">
            <h2>{item.title}</h2>
            {state !== "unread" && <span className={`state ${state}`}>{state === "done" ? "已完成" : "废纸篓"}</span>}
          </div>
          <div className="meta"><span>{item.domain}</span><span>·</span><time>{relativeDate(item.queuedAt)}</time></div>
        </div>
      </div>
      <div className="item-actions">
        {state === "trash" ? <>
          <button onClick={(event) => { event.stopPropagation(); void update(restoreFromTrash); }}>恢复</button>
          <button className="danger" onClick={(event) => {
            event.stopPropagation();
            if (window.confirm("永久删除这个条目？此操作无法撤销。")) void removeItem(item.id).then(() => onChange(null));
          }}>永久删除</button>
        </> : <button onClick={(event) => { event.stopPropagation(); void update(moveToTrash); }}>删除</button>}
      </div>
    </article>
  );
}

function SettingsPanel({ settings, onSave }: { settings: Settings; onSave: (settings: Settings) => Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  async function save() {
    await onSave(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  return (
    <section className="settings-panel">
      <div className="section-title"><h1>设置</h1></div>
      <div className="settings-card">
        <h2>浏览行为</h2>
        <label className="toggle-row"><div><strong>Capture 后关闭原标签页</strong><small>只在按 Enter 确认后关闭；固定标签页不会关闭。</small></div><input type="checkbox" checked={draft.closeAfterCapture} onChange={(e) => setDraft({ ...draft, closeAfterCapture: e.target.checked })} /></label>
        <label className="toggle-row"><div><strong>始终在新标签页打开</strong><small>关闭时，若相同网址已打开则直接切换过去。</small></div><input type="checkbox" checked={draft.alwaysOpenNewTab} onChange={(e) => setDraft({ ...draft, alwaysOpenNewTab: e.target.checked })} /></label>
      </div>
      <div className="settings-card">
        <h2>快速捕获</h2>
        <label className="scale-row">
          <div><strong>Popup 尺寸</strong><small>只影响 Option+Shift+S 打开的快速捕获窗口。</small></div>
          <div className="scale-control"><input type="range" min="80" max="100" step="5" value={Math.round(draft.popupScale * 100)} onChange={(e) => setDraft({ ...draft, popupScale: Number(e.target.value) / 100 })} /><output>{Math.round(draft.popupScale * 100)}%</output></div>
        </label>
      </div>
      <div className="settings-card">
        <h2>快捷备注</h2>
        <p className="settings-help">在 Quick Capture 中按 Ctrl+E，再按对应数字插入。</p>
        <div className="preset-grid">{draft.presets.map((preset, index) => <label key={index}><span>{index + 1}</span><input value={preset} maxLength={100} placeholder="留空即停用" onChange={(e) => {
          const presets = [...draft.presets]; presets[index] = e.target.value; setDraft({ ...draft, presets });
        }} /></label>)}</div>
      </div>
      <button className="primary" onClick={() => void save()}>{saved ? "已保存" : "保存设置"}</button>
    </section>
  );
}

function App() {
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [view, setView] = useState<QueueView>("unread");
  const [query, setQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  async function reload() {
    const [nextItems, nextSettings] = await Promise.all([getItems(), getSettings()]);
    localStorage.setItem("popupScale", String(nextSettings.popupScale));
    setItems(nextItems); setSettings(nextSettings); setLoading(false);
  }

  useEffect(() => {
    void reload();
    const listener = () => void reload();
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target;
      const isEditing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);
      if (showSettings || event.key !== "/" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isEditing) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    }

    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, [showSettings]);

  const visible = useMemo(() => {
    if (query.trim()) return searchItems(items, query, settings.sortOrder);
    return itemsForView(items, view, settings.sortOrder);
  }, [items, query, settings.sortOrder, view]);

  const grouped = useMemo(() => {
    if (view === "source" && !query.trim()) {
      return visible.reduce((groups, item) => {
        const group = groups.get(item.domain) ?? [];
        group.push(item);
        groups.set(item.domain, group);
        return groups;
      }, new Map<string, ReadingItem[]>());
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return visible.reduce((groups, item) => {
      const label = item.queuedAt >= today.getTime() ? "今天" : "更早";
      const group = groups.get(label) ?? [];
      group.push(item);
      groups.set(label, group);
      return groups;
    }, new Map<string, ReadingItem[]>());
  }, [visible, view, query]);

  function applyChange(next: ReadingItem | null) {
    if (!next) return void reload();
    setItems((current) => current.map((item) => item.id === next.id ? next : item));
  }

  const unreadCount = items.filter((item) => stateOf(item) === "unread").length;
  const currentLabel = query.trim() ? "搜索结果" : VIEWS.find(({ id }) => id === view)?.label;

  return (
    <div className="shell">
      <aside>
        <div className="brand"><img className="logo" src="/icon.png" alt="" /><div><strong>LinkPouch</strong><span>{unreadCount} 项待阅读</span></div></div>
        <nav>{VIEWS.map(({ id, label }) => {
          const count = itemsForView(items, id, settings.sortOrder).length;
          return <button key={id} className={!showSettings && view === id ? "active" : ""} onClick={() => { setView(id); setShowSettings(false); }}><NavIcon view={id} /><span>{label}</span>{count > 0 && <em>{count}</em>}</button>;
        })}</nav>
        <button className={showSettings ? "settings-link active" : "settings-link"} onClick={() => setShowSettings(true)}><NavIcon view="settings" /><span>设置</span></button>
      </aside>
      <main className="content">
        {showSettings ? <SettingsPanel settings={settings} onSave={async (next) => { localStorage.setItem("popupScale", String(next.popupScale)); await persistSettings(next); setSettings(next); }} /> : <>
          <header className="toolbar">
            <div><h1>{currentLabel}</h1></div>
            <div className="toolbar-actions">
              <label className="search"><span>⌕</span><input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="按 / 搜索标题、网址、来源或备注" /></label>
              <button className="sort-button" type="button" aria-label="切换时间排序" title="点击切换时间排序" onClick={() => {
                const next = { ...settings, sortOrder: settings.sortOrder === "newest" ? "oldest" as const : "newest" as const };
                setSettings(next); void persistSettings(next);
              }}><span>{settings.sortOrder === "newest" ? "最新优先" : "最旧优先"}</span><strong aria-hidden="true">{settings.sortOrder === "newest" ? "↓" : "↑"}</strong></button>
            </div>
          </header>
          <section className="list grouped-list" aria-busy={loading}>
            {[...grouped.entries()].map(([label, groupItems]) => <section className="queue-group" key={label}><h2>{label}{view === "source" && <span>{groupItems.length}</span>}</h2>{groupItems.map((item) => <QueueItem key={item.id} item={item} onChange={applyChange} />)}</section>)}
            {!loading && visible.length === 0 && <div className="empty"><div>✓</div><h2>{query ? "没有匹配的条目" : view === "unread" ? "队列已清空" : "这里还没有内容"}</h2><p>{query ? "换一个关键词试试。" : "遇到想稍后阅读的页面时，用 Capture 快捷键加入队列。"}</p></div>}
            {!loading && visible.length > 0 && <div className="item-count">{visible.length} 项</div>}
          </section>
        </>}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
