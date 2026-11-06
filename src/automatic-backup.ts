import { getDirectory } from "./directories";
import { getBackup } from "./repository";

export interface BackupStatus {
  lastSuccessAt?: number;
  error?: "permission" | "write";
}

export async function getBackupStatus(): Promise<BackupStatus> {
  return (await chrome.storage.local.get("backupStatus")).backupStatus ?? {};
}

export async function backupNow(): Promise<void> {
  await navigator.locks.request("linkpouch-backup-write", async () => {
    const previous = await getBackupStatus();
    try {
      const directory = await getDirectory("backups");
      if (!directory) return;
      if (await directory.handle.queryPermission({ mode: "readwrite" }) !== "granted") {
        await chrome.storage.local.set({ backupStatus: { ...previous, error: "permission" } });
        return;
      }
      const backup = await getBackup();
      // Seven weekday slots keep disk usage bounded without deleting user files.
      const file = await directory.handle.getFileHandle(`linkpouch-auto-backup-${new Date().getDay()}.json`, { create: true });
      const writer = await file.createWritable();
      try {
        await writer.write(JSON.stringify(backup));
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => {});
        throw error;
      }
      await chrome.storage.local.set({ backupStatus: { lastSuccessAt: Date.now() } satisfies BackupStatus });
    } catch {
      await chrome.storage.local.set({ backupStatus: { ...previous, error: "write" } satisfies BackupStatus });
    }
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function scheduleBackup(): void {
  clearTimeout(timer);
  timer = setTimeout(() => { void backupNow().catch(console.error); }, 1000);
}
