import { useEffect, useState } from "react";
import type { Language } from "../domain";
import { getDirectory, saveDirectory, type SavedDirectory } from "../directories";
import { backupNow, getBackupStatus, type BackupStatus } from "../automatic-backup";
import { t } from "../i18n";

export function AutomaticBackup({ language }: { language: Language }) {
  const [directory, setDirectory] = useState<SavedDirectory>();
  const [status, setStatus] = useState<BackupStatus>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getDirectory("backups").then(setDirectory);
    void getBackupStatus().then(setStatus);
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes.backupStatus) setStatus(changes.backupStatus.newValue ?? {});
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function configure(reauthorize = false) {
    setBusy(true);
    try {
      if (reauthorize && directory) {
        if (await directory.handle.requestPermission({ mode: "readwrite" }) !== "granted") return;
      } else {
        const handle = await window.showDirectoryPicker({ id: "linkpouch-backups", mode: "readwrite" });
        const selected = { id: crypto.randomUUID(), handle };
        await saveDirectory("backups", selected);
        setDirectory(selected);
      }
      await backupNow();
      setStatus(await getBackupStatus());
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setStatus({ ...status, error: "write" });
    } finally {
      setBusy(false);
    }
  }

  return <div className="backup-row">
    <div>
      <strong>{t(language, "settings.autoBackup")}</strong>
      <small>{t(language, "settings.autoBackupHelp")}</small>
      {directory && <small>{directory.handle.name}{status.lastSuccessAt && ` · ${t(language, "settings.lastBackup", { time: new Date(status.lastSuccessAt).toLocaleString(language) })}`}</small>}
      {status.error && <small role="status">{t(language, status.error === "permission" ? "settings.backupPermission" : "settings.backupWriteError")}</small>}
    </div>
    <span>
      {status.error === "permission" && <button className="secondary" disabled={busy} onClick={() => void configure(true)}>{t(language, "gallery.authorize")}</button>}
      <button className="secondary" disabled={busy} onClick={() => void configure()}>{t(language, directory ? "settings.changeBackupDirectory" : "settings.chooseBackupDirectory")}</button>
    </span>
  </div>;
}
