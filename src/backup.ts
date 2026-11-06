import { DEFAULT_SETTINGS, type LocalImage, type ReadingItem, type Settings } from "./domain";

export const BACKUP_FORMAT = "linkpouch-backup-v1";
const RECOVERY_FORMAT = "linkpouch-recovery-v1";

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  readingItems: ReadingItem[];
  settings: Settings;
  localImages: LocalImage[];
  imageDirectoryId?: string;
}

export interface RestoredBackup {
  items: ReadingItem[];
  settings: Settings | undefined;
  localImages?: LocalImage[];
  imageDirectoryId?: string;
}

export function createBackup(items: ReadingItem[], settings: Settings, options: {
  exportedAt?: string; localImages?: LocalImage[]; imageDirectoryId?: string;
} = {}): BackupFile {
  return {
    format: BACKUP_FORMAT, exportedAt: options.exportedAt ?? new Date().toISOString(),
    readingItems: items, settings, localImages: options.localImages ?? [],
    ...(options.imageDirectoryId === undefined ? {} : { imageDirectoryId: options.imageDirectoryId }),
  };
}

export function parseBackup(text: string): RestoredBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("无效的备份文件");
  }

  if (!isRecord(value) || (value.format !== BACKUP_FORMAT && value.format !== RECOVERY_FORMAT)) {
    throw new Error("无效的备份文件");
  }

  const items = value.readingItems;
  if (!Array.isArray(items) || !items.every(isReadingItem) || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("无效的备份文件");
  }

  const settings = value.settings === undefined ? undefined : parseSettings(value.settings);
  if (value.settings !== undefined && !settings) throw new Error("无效的备份文件");
  if (value.localImages !== undefined && (!Array.isArray(value.localImages)
    || !value.localImages.every(isLocalImage)
    || new Set(value.localImages.map((image) => image.id)).size !== value.localImages.length)) {
    throw new Error("无效的备份文件");
  }
  if (value.imageDirectoryId !== undefined && typeof value.imageDirectoryId !== "string") throw new Error("无效的备份文件");
  return {
    items, settings,
    ...(value.localImages === undefined ? {} : { localImages: value.localImages as LocalImage[] }),
    ...(value.imageDirectoryId === undefined ? {} : { imageDirectoryId: value.imageDirectoryId }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReadingItem(value: unknown): value is ReadingItem {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.url === "string"
    && typeof value.title === "string"
    && typeof value.domain === "string"
    && typeof value.note === "string"
    && isTimestamp(value.createdAt)
    && isTimestamp(value.queuedAt)
    && isOptionalTimestamp(value.doneAt)
    && isOptionalTimestamp(value.deletedAt)
    && (value.content === undefined || (isRecord(value.content)
      && (value.content.kind === "page" || value.content.kind === "selection")
      && typeof value.content.html === "string" && typeof value.content.text === "string"
      && (value.content.author === undefined || typeof value.content.author === "string")))
    && (value.images === undefined || (Array.isArray(value.images) && value.images.every((image: unknown) =>
      isRecord(image) && typeof image.url === "string" && URL.canParse(image.url) && typeof image.alt === "string")));
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function isLocalImage(value: unknown): value is LocalImage {
  return isRecord(value) && ["id", "directoryId", "fileName", "itemId", "title", "alt"].every((key) => typeof value[key] === "string")
    && isWebUrl(value.sourceUrl) && isTimestamp(value.createdAt);
}

function parseSettings(value: unknown): Settings | undefined {
  if (!isRecord(value)
    || !Array.isArray(value.presets)
    || value.presets.length !== 9
    || !value.presets.every((preset) => typeof preset === "string")
    || typeof value.closeAfterCapture !== "boolean"
    || typeof value.popupScale !== "number"
    || !Number.isFinite(value.popupScale)
    || value.popupScale < 0.8
    || value.popupScale > 1
    || (value.sortOrder !== "newest" && value.sortOrder !== "oldest")
    || (value.theme !== "system" && value.theme !== "light" && value.theme !== "dark")
    || (value.language !== "zh-CN" && value.language !== "en")) return undefined;

  const openBehavior = value.openBehavior === "allWindows" || value.openBehavior === "queueWindow" || value.openBehavior === "newTab"
    ? value.openBehavior
    : value.alwaysOpenNewTab === true ? "newTab" : DEFAULT_SETTINGS.openBehavior;
  const queueOpenBehavior = value.queueOpenBehavior === "allWindows" || value.queueOpenBehavior === "currentWindow"
    ? value.queueOpenBehavior
    : DEFAULT_SETTINGS.queueOpenBehavior;
  return {
    presets: value.presets,
    closeAfterCapture: value.closeAfterCapture,
    openBehavior,
    queueOpenBehavior,
    popupScale: value.popupScale,
    sortOrder: value.sortOrder,
    theme: value.theme,
    language: value.language,
  };
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalTimestamp(value: unknown): value is number | null {
  return value === null || isTimestamp(value);
}
