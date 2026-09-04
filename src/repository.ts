import { DEFAULT_SETTINGS, type ReadingItem, type Settings } from "./domain";
import type { CaptureSession } from "./messages";

const ITEMS_KEY = "readingItems";
const SETTINGS_KEY = "settings";
const CAPTURE_SESSION_KEY = "captureSession";

export async function getItems(): Promise<ReadingItem[]> {
  const result = await chrome.storage.local.get(ITEMS_KEY);
  return Array.isArray(result[ITEMS_KEY]) ? result[ITEMS_KEY] : [];
}

export async function setItems(items: ReadingItem[]): Promise<void> {
  await chrome.storage.local.set({ [ITEMS_KEY]: items });
}

export async function updateItem(id: string, update: (item: ReadingItem) => ReadingItem): Promise<ReadingItem | undefined> {
  const items = await getItems();
  let changed: ReadingItem | undefined;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    changed = update(item);
    return changed;
  });
  if (changed) await setItems(next);
  return changed;
}

export async function removeItem(id: string): Promise<void> {
  await setItems((await getItems()).filter((item) => item.id !== id));
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
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function restoreBackup(items: ReadingItem[], settings: Settings | undefined): Promise<void> {
  await chrome.storage.local.set({
    [ITEMS_KEY]: items,
    ...(settings === undefined ? {} : { [SETTINGS_KEY]: settings }),
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

