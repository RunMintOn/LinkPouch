import { describe, expect, it } from "vitest";
import { createBackup, parseBackup } from "./backup";
import { DEFAULT_SETTINGS, type ReadingItem } from "./domain";

const item: ReadingItem = {
  id: "item-1",
  url: "https://example.com/article",
  title: "Article",
  domain: "example.com",
  note: "Later",
  createdAt: 1,
  queuedAt: 2,
  doneAt: null,
  deletedAt: null,
};

describe("backup files", () => {
  it("exports and restores the queue and settings", () => {
    const backup = createBackup([item], { ...DEFAULT_SETTINGS, language: "en" }, "2026-09-04T00:00:00.000Z");

    expect(parseBackup(JSON.stringify(backup))).toEqual({ items: [item], settings: { ...DEFAULT_SETTINGS, language: "en" } });
  });

  it("uses the default queue-window behavior for older backups", () => {
    const { queueOpenBehavior: _, ...oldSettings } = DEFAULT_SETTINGS;
    const backup = { format: "linkpouch-backup-v1", exportedAt: "2026-09-04T00:00:00.000Z", readingItems: [item], settings: oldSettings };

    expect(parseBackup(JSON.stringify(backup)).settings).toMatchObject({ queueOpenBehavior: "allWindows" });
  });

  it("restores the one-time recovery export without changing settings", () => {
    const recovery = { format: "linkpouch-recovery-v1", exportedAt: "2026-09-04T00:00:00.000Z", readingItems: [item] };

    expect(parseBackup(JSON.stringify(recovery))).toEqual({ items: [item], settings: undefined });
  });

  it("rejects malformed items before they can overwrite a queue", () => {
    const malformed = { format: "linkpouch-backup-v1", exportedAt: "2026-09-04T00:00:00.000Z", readingItems: [{ ...item, url: 42 }], settings: DEFAULT_SETTINGS };

    expect(() => parseBackup(JSON.stringify(malformed))).toThrow("无效的备份文件");
  });
});
