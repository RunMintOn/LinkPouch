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
import { createBackup, parseBackup, type RestoredBackup } from "../backup";
import { t, viewLabel } from "../i18n";
import { sendMessage } from "../chrome";
import { getItems, getSettings, removeItem, restoreBackup, setItems as persistItems, setSettings as persistSettings } from "../repository";
import { applyTheme } from "../theme";
import "./queue.css";

const VIEWS: QueueView[] = ["unread", "today", "week", "source", "done", "trash"];

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

function relativeDate(timestamp: number, language: Settings["language"]): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (date.getTime() >= today) return date.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" });
  if (date.getTime() >= today - day) return t(language, "queue.yesterday");
  return date.toLocaleDateString(language, { month: "short", day: "numeric" });
}

function SiteIcon({ item }: { item: ReadingItem }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="site-favicon fallback" aria-hidden="true">{item.domain.charAt(0).toUpperCase()}</div>;

  const favicon = new URL(chrome.runtime.getURL("/_favicon/"));
  favicon.searchParams.set("pageUrl", item.url);
  favicon.searchParams.set("size", "32");
  return <img className="site-favicon" src={favicon.href} alt="" onError={() => setFailed(true)} />;
}

function QueueItem({ item, language, onChange }: { item: ReadingItem; language: Settings["language"]; onChange: (next: ReadingItem | null) => void }) {
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
        title={state === "done" ? t(language, "queue.markUnread") : t(language, "queue.markDone")}
        aria-label={state === "done" ? t(language, "queue.markUnread") : t(language, "queue.markDone")}
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
            {state !== "unread" && <span className={`state ${state}`}>{state === "done" ? t(language, "state.done") : t(language, "state.trash")}</span>}
          </div>
          <div className="meta"><span>{item.domain}</span><span>·</span><time>{relativeDate(item.queuedAt, language)}</time></div>
        </div>
      </div>
      <div className="item-actions">
        {state === "trash" ? <>
          <button onClick={(event) => { event.stopPropagation(); void update(restoreFromTrash); }}>{t(language, "queue.restore")}</button>
          <button className="danger" onClick={(event) => {
            event.stopPropagation();
            if (window.confirm(t(language, "queue.deleteForeverConfirm"))) void removeItem(item.id).then(() => onChange(null));
          }}>{t(language, "queue.deleteForever")}</button>
        </> : <button onClick={(event) => { event.stopPropagation(); void update(moveToTrash); }}>{t(language, "queue.delete")}</button>}
      </div>
    </article>
  );
}

function SettingsPanel({
  settings,
  items,
  onSave,
  onRestore,
}: {
  settings: Settings;
  items: ReadingItem[];
  onSave: (settings: Settings) => Promise<void>;
  onRestore: (backup: RestoredBackup) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const language = draft.language;

  useEffect(() => { setDraft(settings); setDirty(false); }, [settings]);

  function updateDraft(next: Settings) {
    setDraft(next);
    setDirty(true);
  }

  async function save() {
    await onSave(draft);
    setDirty(false);
  }

  function downloadBackup() {
    const data = JSON.stringify(createBackup(items, settings), null, 2);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    link.download = `linkpouch-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function restore(file: File) {
    try {
      const backup = parseBackup(await file.text());
      if (!window.confirm(t(language, "settings.restoreConfirm", { count: items.length }))) return;
      await onRestore(backup);
      setRestoreStatus(t(language, "settings.restoreSuccess", { count: backup.items.length }));
    } catch {
      setRestoreStatus(t(language, "settings.restoreError"));
    }
  }

  return (
    <section className="settings-panel">
      <div className="section-title settings-title"><h1>{t(language, "settings.title")}</h1><button className="settings-save" disabled={!dirty} onClick={() => void save()}>{dirty ? t(language, "settings.save") : t(language, "settings.saved")}</button></div>
      <div className="settings-card">
        <h2>{t(language, "settings.appearance")}</h2>
        <label className="select-row"><div><strong>{t(language, "settings.theme")}</strong><small>{t(language, "settings.themeHelp")}</small></div><select value={draft.theme} onChange={(e) => updateDraft({ ...draft, theme: e.target.value as Settings["theme"] })}><option value="system">{t(language, "settings.themeSystem")}</option><option value="light">{t(language, "settings.themeLight")}</option><option value="dark">{t(language, "settings.themeDark")}</option></select></label>
        <label className="select-row"><div><strong>{t(language, "settings.language")}</strong><small>{t(language, "settings.languageHelp")}</small></div><select value={language} onChange={(e) => updateDraft({ ...draft, language: e.target.value as Settings["language"] })}><option value="zh-CN">{t(language, "settings.languageChinese")}</option><option value="en">{t(language, "settings.languageEnglish")}</option></select></label>
      </div>
      <div className="settings-card">
        <h2>{t(language, "settings.browsing")}</h2>
        <label className="toggle-row"><div><strong>{t(language, "settings.closeAfterCapture")}</strong><small>{t(language, "settings.closeAfterCaptureHelp")}</small></div><input type="checkbox" checked={draft.closeAfterCapture} onChange={(e) => updateDraft({ ...draft, closeAfterCapture: e.target.checked })} /></label>
        <label className="select-row"><div><strong>{t(language, "settings.openBehavior")}</strong><small>{t(language, "settings.openBehaviorHelp")}</small></div><select value={draft.openBehavior} onChange={(e) => updateDraft({ ...draft, openBehavior: e.target.value as Settings["openBehavior"] })}><option value="allWindows">{t(language, "settings.openBehaviorAllWindows")}</option><option value="queueWindow">{t(language, "settings.openBehaviorQueueWindow")}</option><option value="newTab">{t(language, "settings.openBehaviorNewTab")}</option></select></label>
        <label className="select-row"><div><strong>{t(language, "settings.queueOpenBehavior")}</strong><small>{t(language, "settings.queueOpenBehaviorHelp")}</small></div><select value={draft.queueOpenBehavior} onChange={(e) => updateDraft({ ...draft, queueOpenBehavior: e.target.value as Settings["queueOpenBehavior"] })}><option value="allWindows">{t(language, "settings.queueOpenBehaviorAllWindows")}</option><option value="currentWindow">{t(language, "settings.queueOpenBehaviorCurrentWindow")}</option></select></label>
      </div>
      <div className="settings-card">
        <h2>{t(language, "settings.quickCapture")}</h2>
        <label className="scale-row">
          <div><strong>{t(language, "settings.popupSize")}</strong><small>{t(language, "settings.popupSizeHelp")}</small></div>
          <div className="scale-control"><input type="range" min="80" max="100" step="5" value={Math.round(draft.popupScale * 100)} onChange={(e) => updateDraft({ ...draft, popupScale: Number(e.target.value) / 100 })} /><output>{Math.round(draft.popupScale * 100)}%</output></div>
        </label>
      </div>
      <div className="settings-card">
        <h2>{t(language, "settings.presetNotes")}</h2>
        <p className="settings-help">{t(language, "settings.presetNotesHelp")}</p>
        <div className="preset-grid">{draft.presets.map((preset, index) => <label key={index}><span>{index + 1}</span><input value={preset} maxLength={100} placeholder={t(language, "settings.emptyPreset")} onChange={(e) => {
          const presets = [...draft.presets]; presets[index] = e.target.value; updateDraft({ ...draft, presets });
        }} /></label>)}</div>
      </div>
      <div className="settings-card">
        <h2>{t(language, "settings.backupRestore")}</h2>
        <div className="backup-row"><div><strong>{t(language, "settings.exportBackup")}</strong><small>{t(language, "settings.backupHelp")}</small></div><button className="secondary" type="button" onClick={downloadBackup}>{t(language, "settings.exportBackup")}</button></div>
        <div className="backup-row"><div><strong>{t(language, "settings.restoreBackup")}</strong><small>{t(language, "settings.restoreHelp")}</small></div><button className="secondary" type="button" onClick={() => fileInputRef.current?.click()}>{t(language, "settings.restoreBackup")}</button><input ref={fileInputRef} className="file-input" type="file" accept="application/json,.json" onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void restore(file);
        }} /></div>
        {restoreStatus && <p className="backup-status" role="status">{restoreStatus}</p>}
      </div>
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

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

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
      const label = item.queuedAt >= today.getTime() ? t(settings.language, "queue.today") : t(settings.language, "queue.earlier");
      const group = groups.get(label) ?? [];
      group.push(item);
      groups.set(label, group);
      return groups;
    }, new Map<string, ReadingItem[]>());
  }, [visible, view, query, settings.language]);

  function applyChange(next: ReadingItem | null) {
    if (!next) return void reload();
    setItems((current) => current.map((item) => item.id === next.id ? next : item));
  }

  const unreadCount = items.filter((item) => stateOf(item) === "unread").length;
  const currentLabel = query.trim() ? t(settings.language, "queue.searchResults") : viewLabel(settings.language, view);

  return (
    <div className="shell">
      <aside>
        <div className="brand"><img className="logo" src="/icon.png" alt="" /><div><strong>LinkPouch</strong><span>{t(settings.language, "queue.unreadCount", { count: unreadCount })}</span></div></div>
        <nav>{VIEWS.map((id) => {
          const count = itemsForView(items, id, settings.sortOrder).length;
          return <button key={id} className={!showSettings && view === id ? "active" : ""} onClick={() => { setView(id); setShowSettings(false); }}><NavIcon view={id} /><span>{viewLabel(settings.language, id)}</span>{count > 0 && <em>{count}</em>}</button>;
        })}</nav>
        <button className={showSettings ? "settings-link active" : "settings-link"} onClick={() => setShowSettings(true)}><NavIcon view="settings" /><span>{t(settings.language, "settings.title")}</span></button>
      </aside>
      <main className="content">
        {showSettings ? <SettingsPanel settings={settings} items={items} onSave={async (next) => { localStorage.setItem("popupScale", String(next.popupScale)); await persistSettings(next); setSettings(next); }} onRestore={async (backup) => {
          await restoreBackup(backup.items, backup.settings);
          setItems(backup.items);
          if (backup.settings) {
            localStorage.setItem("popupScale", String(backup.settings.popupScale));
            setSettings(backup.settings);
          }
        }} /> : <>
          <header className="toolbar">
            <div><h1>{currentLabel}</h1></div>
            <div className="toolbar-actions">
              <label className="search"><span>⌕</span><input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(settings.language, "queue.searchPlaceholder")} /></label>
              <button className="sort-button" type="button" aria-label={t(settings.language, "queue.sortTitle")} title={t(settings.language, "queue.sortTitle")} onClick={() => {
                const next = { ...settings, sortOrder: settings.sortOrder === "newest" ? "oldest" as const : "newest" as const };
                setSettings(next); void persistSettings(next);
              }}><span>{settings.sortOrder === "newest" ? t(settings.language, "queue.sortNewest") : t(settings.language, "queue.sortOldest")}</span><strong aria-hidden="true">{settings.sortOrder === "newest" ? "↓" : "↑"}</strong></button>
            </div>
          </header>
          <section className="list grouped-list" aria-busy={loading}>
            {[...grouped.entries()].map(([label, groupItems]) => <section className="queue-group" key={label}><h2>{label}{view === "source" && <span>{groupItems.length}</span>}</h2>{groupItems.map((item) => <QueueItem key={item.id} item={item} language={settings.language} onChange={applyChange} />)}</section>)}
            {!loading && visible.length === 0 && <div className="empty"><div>✓</div><h2>{query ? t(settings.language, "queue.noResults") : view === "unread" ? t(settings.language, "queue.emptyUnread") : t(settings.language, "queue.emptyOther")}</h2><p>{query ? t(settings.language, "queue.tryAnotherQuery") : t(settings.language, "queue.emptyHelp")}</p></div>}
            {!loading && visible.length > 0 && <div className="item-count">{t(settings.language, "queue.itemCount", { count: visible.length })}</div>}
          </section>
        </>}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
