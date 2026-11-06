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
import { getItems, getSettings, removeItem, restoreBackup, setItems as persistItems, setSettings as persistSettings, updateItem } from "../repository";
import { applyTheme } from "../theme";
import { isImeInput } from "../popup/ime";
import { SavedContent } from "../SavedContent";
import { Gallery } from "./Gallery";
import "./queue.css";

const VIEWS: QueueView[] = ["all", "unread", "today", "week", "source", "done", "trash"];

function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

function NavIcon({ view }: { view: QueueView | "settings" }) {
  const paths: Record<QueueView | "settings", React.ReactNode> = {
    all: <><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M7 7h6M7 10h6M7 13h4" /></>,
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

function itemTitle(item: ReadingItem): string {
  return /^Post by .+ on X$/i.test(item.title) ? "" : item.title;
}

function itemSource(item: ReadingItem): string {
  const author = item.url.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/]+)\/status\//)?.[1];
  return item.content?.author || (author ? `@${author}` : item.domain);
}

function CardImage({ image, count }: { image: NonNullable<ReadingItem["images"]>[number]; count: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <div className="card-media">
    <img src={image.url} alt={image.alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    {count > 1 && <span className="card-image-count">{count}</span>}
  </div>;
}

function QueueItem({ item, language, selected, searchActive, onChange, onPreview }: { item: ReadingItem; language: Settings["language"]; selected: boolean; searchActive: boolean; onChange: (next: ReadingItem | null) => void; onPreview: (item: ReadingItem) => void }) {
  const state = stateOf(item);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const card = cardRef.current!;
    // Pixel-sized rows reserve the card height plus its bottom spacing.
    const observer = new ResizeObserver(([entry]) => {
      card.style.gridRowEnd = `span ${Math.ceil(entry.contentRect.height + 16)}`;
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  async function update(transform: (value: ReadingItem) => ReadingItem) {
    const all = await getItems();
    const nextItem = transform(item);
    await persistItems(all.map((candidate) => candidate.id === item.id ? nextItem : candidate));
    onChange(nextItem);
  }

  return (
    <article ref={cardRef} className={`queue-item${selected ? " selected" : ""}${searchActive ? " search-active" : ""}`}>
      <button id={`queue-card-${item.id}`} className="card-preview" onClick={() => onPreview(item)} aria-label={`${t(language, "content.view")}: ${itemTitle(item) || itemSource(item)}`} aria-pressed={selected}>
        {item.images?.[0] && <CardImage key={item.images[0].url} image={item.images[0]} count={item.images.length} />}
        <div className="card-body">
          <div className="card-source">
            <SiteIcon item={item} />
            <span>{itemSource(item)}</span>
            <time dateTime={new Date(item.queuedAt).toISOString()}>{relativeDate(item.queuedAt, language)}</time>
          </div>
          {itemTitle(item) && <h2>{itemTitle(item)}</h2>}
          {item.content?.text && <p className="card-excerpt">{item.content.text}</p>}
          {item.note && <p className="item-note">{item.note}</p>}
        </div>
      </button>
      <div className="card-actions">
        <button
          className={state === "done" ? "check checked" : "check"}
          title={state === "done" ? t(language, "queue.markUnread") : t(language, "queue.markDone")}
          aria-label={state === "done" ? t(language, "queue.markUnread") : t(language, "queue.markDone")}
          onClick={() => void update(state === "done" ? markUnread : markDone)}
          disabled={state === "trash"}
        >{state === "done" ? "✓" : ""}</button>
        {state !== "unread" && <span className={`state ${state}`}>{state === "done" ? t(language, "state.done") : t(language, "state.trash")}</span>}
        <div className="card-item-actions">
          {state === "trash" ? <>
            <button onClick={() => void update(restoreFromTrash)}>{t(language, "queue.restore")}</button>
            <button className="danger" onClick={() => {
              if (window.confirm(t(language, "queue.deleteForeverConfirm"))) void removeItem(item.id).then(() => onChange(null));
            }}>{t(language, "queue.deleteForever")}</button>
          </> : <button onClick={() => void update(moveToTrash)}>{t(language, "queue.delete")}</button>}
        </div>
      </div>
    </article>
  );
}

function ItemDetail({ item, language, onBack, onSave }: { item: ReadingItem; language: Settings["language"]; onBack: () => void; onSave: (id: string, fields: Partial<Pick<ReadingItem, "title" | "note">>) => Promise<void> }) {
  const detailRef = useRef<HTMLElement>(null);
  const composing = useRef(false);
  const [title, setTitle] = useState(item.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [note, setNote] = useState(item.note);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "error">();
  const saveVersion = useRef(0);

  function save(fields: Partial<Pick<ReadingItem, "title" | "note">>) {
    setSaveStatus("saving");
    const version = ++saveVersion.current;
    void onSave(item.id, fields).then(
      () => { if (version === saveVersion.current) setSaveStatus("saved"); },
      () => { if (version === saveVersion.current) setSaveStatus("error"); },
    );
  }

  useEffect(() => {
    detailRef.current!.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!detailRef.current!.contains(event.target as Node)) onBack();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [onBack]);

  return <section ref={detailRef} className="item-detail" tabIndex={-1} aria-label={t(language, "content.view")}
    onCompositionStartCapture={() => { composing.current = true; }} onCompositionEndCapture={() => { composing.current = false; }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && isEditingTarget(event.target) && !isImeInput(event.nativeEvent, composing.current)) {
        event.preventDefault();
        event.stopPropagation();
        setEditingTitle(false);
        detailRef.current!.focus({ preventScroll: true });
      }
    }}>
    <div className="detail-toolbar">
      <a href={item.url} target="_blank" rel="noreferrer" onClick={(event) => {
        event.preventDefault();
        void sendMessage({ type: "OPEN_ITEM", url: item.url });
      }}>{t(language, "content.source")} ↗</a>
      {item.images?.some((image) => new URL(image.url).hostname === "pbs.twimg.com") && <button className="secondary" onClick={() => void sendMessage({ type: "OPEN_QUEUE", itemId: item.id, download: true })}>{t(language, "gallery.download")} · {item.images.length}</button>}
      <button className="detail-close" onClick={onBack} aria-label={t(language, "content.close")}>×</button>
    </div>
    {editingTitle ? <textarea className="detail-title-input" autoFocus rows={3} value={title} aria-label={t(language, "content.title")} onChange={(event) => {
      setTitle(event.target.value);
      save({ title: event.target.value });
    }} onBlur={() => setEditingTitle(false)} onKeyDown={(event) => {
      if (event.key === "Enter" && !event.shiftKey && !isImeInput(event.nativeEvent, composing.current)) {
        event.preventDefault();
        setEditingTitle(false);
        detailRef.current!.focus({ preventScroll: true });
      }
    }} /> : <h2 aria-label={itemTitle(item) || itemSource(item)}><button className="detail-title-button" aria-label={t(language, "content.editTitle")} onClick={() => setEditingTitle(true)}>
      {itemTitle(item) || itemSource(item)} <span aria-hidden="true">✎</span>
    </button></h2>}
    <p className="detail-meta">{itemSource(item)} · {new Date(item.queuedAt).toLocaleDateString(language)}{item.content && ` · ${t(language, item.content.kind === "selection" ? "content.selection" : "content.page")}`}</p>
    <div className="detail-note-editor">
      <textarea className="detail-note" value={note} onChange={(event) => {
        setNote(event.target.value);
        save({ note: event.target.value });
      }} rows={3} aria-label={t(language, "popup.noteLabel")} placeholder={t(language, "popup.notePlaceholder")} />
      <p className={`detail-note-status${saveStatus === "error" ? " error" : ""}`} role="status">{saveStatus && t(language, `content.note.${saveStatus}`)}</p>
    </div>
    {item.content ? <SavedContent content={item.content} /> : <>
      <p className="detail-missing">{t(language, "content.notSaved")}</p>
      {item.images?.map((image) => <img className="detail-image" key={image.url} src={image.url} alt={image.alt} loading="lazy" referrerPolicy="no-referrer" />)}
    </>}
  </section>;
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
  const route = new URLSearchParams(location.hash.slice(1));
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [view, setView] = useState<QueueView>("all");
  const [query, setQuery] = useState("");
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGallery, setShowGallery] = useState(route.has("gallery"));
  const [selectedId, setSelectedId] = useState<string | null>(route.get("item"));
  const [downloadId, setDownloadId] = useState<string | null>(route.get("download"));
  const [loading, setLoading] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previewOrigin = useRef<HTMLElement | null>(null);
  const composing = useRef(false);
  const itemSaveQueue = useRef<Promise<void>>(Promise.resolve());

  async function reload() {
    const [nextItems, nextSettings] = await Promise.all([getItems(), getSettings()]);
    localStorage.setItem("popupScale", String(nextSettings.popupScale));
    setItems(nextItems); setSettings(nextSettings); setLoading(false);
  }

  useEffect(() => {
    void reload();
    history.replaceState(null, "", location.pathname);
    const navigate = () => {
      const next = new URLSearchParams(location.hash.slice(1));
      setShowSettings(false);
      previewOrigin.current = null;
      setShowGallery(next.has("gallery"));
      setSelectedId(next.get("item"));
      setDownloadId(next.get("download"));
      history.replaceState(null, "", location.pathname);
    };
    const listener = () => void reload();
    chrome.storage.onChanged.addListener(listener);
    window.addEventListener("hashchange", navigate);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
      window.removeEventListener("hashchange", navigate);
    };
  }, []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  const visible = useMemo(() => {
    if (query.trim()) return searchItems(items, query, settings.sortOrder);
    return itemsForView(items, view, settings.sortOrder);
  }, [items, query, settings.sortOrder, view]);

  const grouped = useMemo(() => {
    if (query.trim()) return new Map([["", visible]]);
    if (view === "source") {
      return visible.reduce((groups, item) => {
        const group = groups.get(item.domain) ?? [];
        group.push(item);
        groups.set(item.domain, group);
        return groups;
      }, new Map<string, ReadingItem[]>());
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = new Date(today);
    week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
    return visible.reduce((groups, item) => {
      const label = item.queuedAt >= today.getTime() ? t(settings.language, "queue.today")
        : item.queuedAt >= week.getTime() ? t(settings.language, "view.week")
        : t(settings.language, "queue.earlier");
      const group = groups.get(label) ?? [];
      group.push(item);
      groups.set(label, group);
      return groups;
    }, new Map<string, ReadingItem[]>());
  }, [visible, view, query, settings.language]);

  function openPreview(item: ReadingItem) {
    const origin = document.activeElement as HTMLElement;
    previewOrigin.current = origin === searchInputRef.current || origin.matches(":focus-visible") ? origin : null;
    setActiveResultId(item.id);
    setSelectedId(item.id);
  }

  function closePreview() {
    setSelectedId(null);
    previewOrigin.current?.focus();
    previewOrigin.current = null;
  }

  function changeQuery(value: string) {
    setQuery(value);
    setActiveResultId(null);
  }

  function searchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (isImeInput(event.nativeEvent, composing.current) || event.metaKey || event.ctrlKey || event.altKey) return;
    const ordered = [...grouped.values()].flat();
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query) changeQuery("");
      else event.currentTarget.blur();
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !event.shiftKey && ordered.length) {
      event.preventDefault();
      const index = ordered.findIndex((item) => item.id === activeResultId);
      const next = ordered[Math.max(0, Math.min(ordered.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))];
      setActiveResultId(next.id);
      document.getElementById(`queue-card-${next.id}`)!.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && ordered.length) {
      event.preventDefault();
      openPreview(ordered.find((item) => item.id === activeResultId) ?? ordered[0]);
    }
  }

  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      if (showSettings || showGallery || event.defaultPrevented || isImeInput(event, composing.current)
        || event.metaKey || event.ctrlKey || event.altKey || isEditingTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        setSelectedId(null);
        previewOrigin.current = null;
        searchInputRef.current!.focus();
        searchInputRef.current!.select();
      } else if (event.key === "Escape" && selectedId) {
        event.preventDefault();
        closePreview();
      } else if (selectedId && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        const ordered = [...grouped.values()].flat();
        const index = ordered.findIndex((item) => item.id === selectedId);
        const next = index >= 0 ? ordered[index + (event.key === "ArrowRight" ? 1 : -1)] : undefined;
        if (next) {
          setSelectedId(next.id);
          setActiveResultId(next.id);
        }
      }
    }
    document.addEventListener("keydown", navigate);
    return () => document.removeEventListener("keydown", navigate);
  }, [showSettings, showGallery, selectedId, grouped]);

  function applyChange(next: ReadingItem | null) {
    if (!next) return void reload();
    setItems((current) => current.map((item) => item.id === next.id ? next : item));
  }

  function saveItem(id: string, fields: Partial<Pick<ReadingItem, "title" | "note">>): Promise<void> {
    // Keep writes ordered, including when the preview closes or switches items.
    const save = itemSaveQueue.current.then(async () => {
      const next = await updateItem(id, (item) => ({ ...item, ...fields }));
      if (!next) throw new Error("Reading item not found");
      applyChange(next);
    });
    itemSaveQueue.current = save.catch(() => {});
    return save;
  }

  const unreadCount = items.filter((item) => stateOf(item) === "unread").length;
  const currentLabel = query.trim() ? t(settings.language, "queue.searchResults") : viewLabel(settings.language, view);
  const selectedItem = items.find((item) => item.id === selectedId);

  return (
    <div className="shell" onCompositionStartCapture={() => { composing.current = true; }} onCompositionEndCapture={() => { composing.current = false; }}>
      <aside className="sidebar">
        <div className="brand"><img className="logo" src="/icon.png" alt="" /><div><strong>LinkPouch</strong><span>{t(settings.language, "queue.unreadCount", { count: unreadCount })}</span></div></div>
        <nav>{VIEWS.map((id) => {
          const count = itemsForView(items, id, settings.sortOrder).length;
          return <button key={id} className={!showSettings && !showGallery && view === id ? "active" : ""} onClick={() => { setView(id); setShowSettings(false); setShowGallery(false); setSelectedId(null); changeQuery(""); }}><NavIcon view={id} /><span>{viewLabel(settings.language, id)}</span>{count > 0 && <em>{count}</em>}</button>;
        })}<button className={showGallery ? "active" : ""} onClick={() => { setShowGallery(true); setShowSettings(false); setSelectedId(null); }}><svg className="nav-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2" /><circle cx="7" cy="7" r="1" /><path d="m3 14 5-5 4 4 2-2 3 3" /></svg><span>{t(settings.language, "gallery.title")}</span></button></nav>
        <button className={showSettings ? "settings-link active" : "settings-link"} onClick={() => { setShowSettings(true); setShowGallery(false); setSelectedId(null); }}><NavIcon view="settings" /><span>{t(settings.language, "settings.title")}</span></button>
      </aside>
      <main className="content">
        {showSettings ? <SettingsPanel settings={settings} items={items} onSave={async (next) => { localStorage.setItem("popupScale", String(next.popupScale)); await persistSettings(next); setSettings(next); }} onRestore={async (backup) => {
          await restoreBackup(backup.items, backup.settings);
          setItems(backup.items);
          if (backup.settings) {
            localStorage.setItem("popupScale", String(backup.settings.popupScale));
            setSettings(backup.settings);
          }
        }} /> : showGallery ? <Gallery language={settings.language} pendingItem={items.find((item) => item.id === downloadId)} onDownloaded={() => setDownloadId(null)} /> : <>
          <header className="toolbar">
            <div><h1>{currentLabel}</h1></div>
            <div className="toolbar-actions">
              <label className="search">
                <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
                <input ref={searchInputRef} value={query} onChange={(e) => changeQuery(e.target.value)} onKeyDown={searchKeyDown}
                  onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                  aria-controls="collection-results" aria-activedescendant={searchFocused && activeResultId ? `queue-card-${activeResultId}` : undefined}
                  placeholder={t(settings.language, "queue.searchPlaceholder")} />
              </label>
              <button className="sort-button" type="button" aria-label={t(settings.language, "queue.sortTitle")} title={t(settings.language, "queue.sortTitle")} onClick={() => {
                const next = { ...settings, sortOrder: settings.sortOrder === "newest" ? "oldest" as const : "newest" as const };
                setSettings(next); void persistSettings(next);
              }}><span>{settings.sortOrder === "newest" ? t(settings.language, "queue.sortNewest") : t(settings.language, "queue.sortOldest")}</span><strong aria-hidden="true">{settings.sortOrder === "newest" ? "↓" : "↑"}</strong></button>
            </div>
          </header>
          <section id="collection-results" className="list grouped-list" aria-busy={loading}>
            {[...grouped.entries()].map(([label, groupItems]) => <section className="queue-group" key={label}>
              {label && <h2>{label}{view === "source" && <span>{groupItems.length}</span>}</h2>}
              <div className="card-grid">
                {groupItems.map((item) => <QueueItem key={item.id} item={item} language={settings.language} selected={item.id === selectedId} searchActive={searchFocused && item.id === activeResultId} onChange={applyChange} onPreview={openPreview} />)}
              </div>
            </section>)}
            {!loading && visible.length === 0 && <div className="empty"><div>✓</div><h2>{query ? t(settings.language, "queue.noResults") : view === "unread" ? t(settings.language, "queue.emptyUnread") : t(settings.language, "queue.emptyOther")}</h2><p>{query ? t(settings.language, "queue.tryAnotherQuery") : t(settings.language, "queue.emptyHelp")}</p></div>}
            {!loading && visible.length > 0 && <div className="item-count">{t(settings.language, "queue.itemCount", { count: visible.length })}</div>}
          </section>
        </>}
      </main>
      {!showSettings && !showGallery && selectedItem && <ItemDetail key={selectedItem.id} item={selectedItem} language={settings.language} onBack={closePreview} onSave={saveItem} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
