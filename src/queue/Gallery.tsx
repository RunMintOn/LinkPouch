import { useEffect, useRef, useState } from "react";
import type { Language, ReadingItem } from "../domain";
import { t } from "../i18n";
import {
  chooseImageDirectory, getImageDirectory, getLocalImages, savePostImages,
  type ImageDirectory, type LocalImage,
} from "../image-directory";

function ImageTile({ record, directory, onOpen, language }: {
  record: LocalImage; directory: ImageDirectory;
  onOpen: (image: { record: LocalImage; url: string }) => void; language: Language;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void directory.handle.getFileHandle(record.fileName).then((handle) => handle.getFile()).then((file) => {
      if (active) {
        objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
      }
    }).catch((reason: Error) => setError(reason.message));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [directory, record.fileName]);

  return <figure className="gallery-tile">
    <button className="gallery-image" disabled={!url} onClick={() => onOpen({ record, url })}
      aria-label={record.alt || record.title}>
      {url ? <img src={url} alt={record.alt} loading="lazy" /> : <span>{error || t(language, "gallery.loading")}</span>}
    </button>
    <figcaption><span>{record.title}</span><a href={record.sourceUrl} target="_blank" rel="noreferrer">{t(language, "content.source")}</a></figcaption>
  </figure>;
}

export function Gallery({ language, pendingItem, onDownloaded }: {
  language: Language; pendingItem?: ReadingItem; onDownloaded: () => void;
}) {
  const [directory, setDirectory] = useState<ImageDirectory>();
  const [authorized, setAuthorized] = useState(false);
  const [records, setRecords] = useState<LocalImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<{ record: LocalImage; url: string }>();
  const started = useRef(false);
  const viewer = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    void getImageDirectory().then(async (saved) => {
      setDirectory(saved);
      if (saved) setAuthorized(await saved.handle.queryPermission({ mode: "readwrite" }) === "granted");
    });
    const reload = () => void getLocalImages().then(setRecords);
    reload();
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.localImages) reload();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function authorize() {
    try {
      if (directory) {
        setAuthorized(await directory.handle.requestPermission({ mode: "readwrite" }) === "granted");
      } else {
        const chosen = await chooseImageDirectory();
        setDirectory(chosen);
        setAuthorized(true);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function download(item: ReadingItem, target: ImageDirectory) {
    setBusy(true);
    setStatus(t(language, "gallery.progress", { done: 0, count: item.images?.length ?? 0 }));
    try {
      if (!item.images?.length) throw new Error(t(language, "gallery.noPostImages"));
      await savePostImages(item, target, (done) => setStatus(t(language, "gallery.progress", { done, count: item.images!.length })));
      setStatus(t(language, "gallery.saved", { count: item.images.length }));
      onDownloaded();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (authorized && directory && pendingItem && !started.current) {
      started.current = true;
      void download(pendingItem, directory);
    }
  }, [authorized, directory, pendingItem]);

  useEffect(() => {
    if (selected) viewer.current?.showModal();
  }, [selected]);

  const visible = records.filter((record) => record.directoryId === directory?.id);
  return <section className="gallery">
    <header className="toolbar">
      <div><h1>{t(language, "gallery.title")}</h1>{directory && <p className="directory-name">{directory.handle.name} · {visible.length}</p>}</div>
      {!authorized && <button className="primary" onClick={() => void authorize()}>{t(language, directory ? "gallery.authorize" : "gallery.choose")}</button>}
    </header>
    {pendingItem && <div className="download-task">
      <span>{pendingItem.title}</span>
      {authorized && !busy && <button className="secondary" onClick={() => void download(pendingItem, directory!)}>{t(language, "gallery.download")}</button>}
    </div>}
    {status && <p className="gallery-status" role="status">{status}</p>}
    {!authorized ? <div className="empty"><h2>{t(language, "gallery.directoryRequired")}</h2><p>{t(language, "gallery.directoryHelp")}</p></div>
      : visible.length === 0 ? <div className="empty"><h2>{t(language, "gallery.empty")}</h2><p>{t(language, "gallery.emptyHelp")}</p></div>
      : <div className="gallery-grid">{visible.map((record) => <ImageTile key={record.id} record={record} directory={directory!} language={language} onOpen={setSelected} />)}</div>}
    <dialog ref={viewer} className="image-viewer" onClose={() => setSelected(undefined)}
      onClick={(event) => { if (event.target === viewer.current) viewer.current.close(); }}>
      {selected && <>
        <div className="viewer-toolbar"><span>{selected.record.title}</span><a href={selected.record.sourceUrl} target="_blank" rel="noreferrer">{t(language, "content.source")}</a><button autoFocus onClick={() => viewer.current?.close()}>{t(language, "content.close")}</button></div>
        <img src={selected.url} alt={selected.record.alt} />
      </>}
    </dialog>
  </section>;
}
