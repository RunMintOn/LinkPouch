import { DEFAULT_SETTINGS, type LocalImage, type ReadingItem, type Settings } from "./domain";
import type { CaptureSession } from "./messages";
import { createBackup, type BackupFile, type RestoredBackup } from "./backup";
import { getDirectory, saveDirectory } from "./directories";

const ITEM_PREFIX = "item:";
const SETTINGS_KEY = "settings";
const CAPTURE_SESSION_KEY = "captureSession";
let ready: Promise<void> | undefined;

// Web Locks coordinate the extension's pages and background worker, not just one tab.
export function withStorageWrite<T>(write: () => Promise<T>): Promise<T> {
  return navigator.locks.request("linkpouch-storage-write", write);
}

export const isItemStorageKey = (key: string): boolean => key.startsWith(ITEM_PREFIX);

function ensureItemStorage(): Promise<void> {
  return ready ??= withStorageWrite(async () => {
    const { itemsVersion, readingItems } = await chrome.storage.local.get(["itemsVersion", "readingItems"]);
    if (itemsVersion === 2) {
      if (readingItems !== undefined) await chrome.storage.local.remove("readingItems");
      return;
    }
    const items: ReadingItem[] = Array.isArray(readingItems) ? readingItems : [];
    await chrome.storage.local.set({
      ...Object.fromEntries(items.map((item) => [ITEM_PREFIX + item.id, item])), itemsVersion: 2,
    });
    // Do not remove the legacy collection until the new records have been saved.
    await chrome.storage.local.remove("readingItems");
  }).catch((error) => { ready = undefined; throw error; });
}

async function readItems(): Promise<ReadingItem[]> {
  const stored = await chrome.storage.local.get(null);
  return Object.entries(stored).filter(([key]) => isItemStorageKey(key)).map(([, value]) => value as ReadingItem);
}

export async function getItems(): Promise<ReadingItem[]> {
  await ensureItemStorage();
  return readItems();
}

export async function updateItems<T extends { items: ReadingItem[] }>(update: (items: ReadingItem[]) => T): Promise<T> {
  await ensureItemStorage();
  return withStorageWrite(async () => {
    const items = await readItems();
    const result = update(items);
    const previous = new Map(items.map((item) => [item.id, item]));
    const nextIds = new Set(result.items.map((item) => item.id));
    const changed = result.items.filter((item) => previous.get(item.id) !== item);
    if (changed.length) await chrome.storage.local.set(Object.fromEntries(changed.map((item) => [ITEM_PREFIX + item.id, item])));
    const removed = items.filter((item) => !nextIds.has(item.id)).map((item) => ITEM_PREFIX + item.id);
    if (removed.length) await chrome.storage.local.remove(removed);
    return result;
  });
}

export async function updateItem(id: string, update: (item: ReadingItem) => ReadingItem): Promise<ReadingItem | undefined> {
  await ensureItemStorage();
  return withStorageWrite(async () => {
    const key = ITEM_PREFIX + id;
    const saved = (await chrome.storage.local.get(key))[key] as ReadingItem | undefined;
    if (!saved) return undefined;
    const changed = update(saved);
    await chrome.storage.local.set({ [key]: changed });
    return changed;
  });
}

export async function removeItem(id: string): Promise<void> {
  await ensureItemStorage();
  await withStorageWrite(() => chrome.storage.local.remove(ITEM_PREFIX + id));
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = (result[SETTINGS_KEY] ?? {}) as Partial<Settings> & { alwaysOpenNewTab?: boolean };
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    presets: [...DEFAULT_SETTINGS.presets].map((fallback, index) => saved.presets?.[index] ?? fallback),
    openBehavior: saved.openBehavior === "allWindows" || saved.openBehavior === "queueWindow" || saved.openBehavior === "newTab"
      ? saved.openBehavior
      : saved.alwaysOpenNewTab ? "newTab" : DEFAULT_SETTINGS.openBehavior,
    queueOpenBehavior: saved.queueOpenBehavior === "allWindows" || saved.queueOpenBehavior === "currentWindow"
      ? saved.queueOpenBehavior
      : DEFAULT_SETTINGS.queueOpenBehavior,
    popupScale: typeof saved.popupScale === "number"
      ? Math.min(1, Math.max(0.8, saved.popupScale))
      : DEFAULT_SETTINGS.popupScale,
    theme: saved.theme === "light" || saved.theme === "dark" || saved.theme === "system"
      ? saved.theme
      : DEFAULT_SETTINGS.theme,
    language: saved.language === "en" || saved.language === "zh-CN"
      ? saved.language
      : DEFAULT_SETTINGS.language,
  };
}

export async function setSettings(settings: Settings): Promise<void> {
  await withStorageWrite(() => chrome.storage.local.set({ [SETTINGS_KEY]: settings }));
}

export async function restoreBackup(items: ReadingItem[], settings: Settings | undefined,
  images: Pick<RestoredBackup, "localImages" | "imageDirectoryId"> = {}): Promise<void> {
  await ensureItemStorage();
  await withStorageWrite(async () => {
    const previous = await readItems();
    const nextIds = new Set(items.map((item) => item.id));
    const directory = images.imageDirectoryId === undefined ? undefined : await getDirectory("images");
    await chrome.storage.local.set({
      ...Object.fromEntries(items.map((item) => [ITEM_PREFIX + item.id, item])),
      ...(settings === undefined ? {} : { [SETTINGS_KEY]: settings }),
      ...(images.localImages === undefined ? {} : { localImages: images.localImages }),
      ...(images.imageDirectoryId === undefined ? {} : { imageDirectoryId: images.imageDirectoryId }),
    });
    const removed = previous.filter((item) => !nextIds.has(item.id)).map((item) => ITEM_PREFIX + item.id);
    if (removed.length) await chrome.storage.local.remove(removed);
    if (directory && directory.id !== images.imageDirectoryId) await saveDirectory("images", undefined);
  });
}

export async function getBackup(): Promise<BackupFile> {
  await ensureItemStorage();
  return withStorageWrite(async () => {
    const [items, settings, stored, directory] = await Promise.all([
      readItems(), getSettings(), chrome.storage.local.get(["localImages", "imageDirectoryId"]), getDirectory("images"),
    ]);
    return createBackup(items, settings, {
      localImages: (stored.localImages ?? []) as LocalImage[],
      imageDirectoryId: directory?.id ?? (typeof stored.imageDirectoryId === "string" ? stored.imageDirectoryId : undefined),
    });
  });
}

export async function getCaptureSession(): Promise<CaptureSession | undefined> {
  const result = await chrome.storage.session.get(CAPTURE_SESSION_KEY);
  return result[CAPTURE_SESSION_KEY] as CaptureSession | undefined;
}

export async function setCaptureSession(session: CaptureSession): Promise<void> {
  await chrome.storage.session.set({ [CAPTURE_SESSION_KEY]: session });
}

export async function clearCaptureSession(): Promise<void> {
  await chrome.storage.session.remove(CAPTURE_SESSION_KEY);
}

