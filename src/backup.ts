import { DEFAULT_SETTINGS, type ReadingItem, type Settings } from "./domain";

export const BACKUP_FORMAT = "linkpouch-backup-v1";
const RECOVERY_FORMAT = "linkpouch-recovery-v1";

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  readingItems: ReadingItem[];
  settings: Settings;
}

export interface RestoredBackup {
  items: ReadingItem[];
  settings: Settings | undefined;
}

export function createBackup(items: ReadingItem[], settings: Settings, exportedAt = new Date().toISOString()): BackupFile {
  return { format: BACKUP_FORMAT, exportedAt, readingItems: items, settings };
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

  if (value.settings === undefined) return { items, settings: undefined };
  const settings = parseSettings(value.settings);
  if (!settings) throw new Error("无效的备份文件");
  return { items, settings };
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
    && isOptionalTimestamp(value.deletedAt);
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
