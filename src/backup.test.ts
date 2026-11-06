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
  it("round-trips saved content and the directory-backed image source index", () => {
    const saved = {
      ...item,
      content: { kind: "page" as const, html: "<p>Saved body</p>", text: "Saved body" },
      images: [{ url: "https://example.com/image.png", alt: "Example" }],
    };
    const localImages = [{
      id: "directory/image.png", directoryId: "directory", fileName: "image.png",
      itemId: item.id, sourceUrl: item.url, title: item.title, alt: "Example", createdAt: 3,
    }];
    const backup = createBackup([saved], DEFAULT_SETTINGS, { localImages, imageDirectoryId: "directory" });

    expect(parseBackup(JSON.stringify(backup))).toEqual({
      items: [saved], settings: DEFAULT_SETTINGS, localImages, imageDirectoryId: "directory",
    });
  });

  it.each([
    { content: { kind: "page", html: 42, text: "body" } },
    { images: [{ url: "not a URL", alt: "image" }] },
  ])("rejects malformed saved content before restore: %j", (fields) => {
    const backup = { format: "linkpouch-backup-v1", readingItems: [{ ...item, ...fields }] };
    expect(() => parseBackup(JSON.stringify(backup))).toThrow("无效的备份文件");
  });

  it("keeps embedded data images that the capture engine can save", () => {
    const saved = { ...item, images: [{ url: "data:image/png;base64,aGVsbG8=", alt: "Embedded" }] };
    expect(parseBackup(JSON.stringify(createBackup([saved], DEFAULT_SETTINGS))).items).toEqual([saved]);
  });

  it("exports and restores the queue and settings", () => {
    const backup = createBackup([item], { ...DEFAULT_SETTINGS, language: "en" }, { exportedAt: "2026-09-04T00:00:00.000Z" });

    expect(parseBackup(JSON.stringify(backup))).toEqual({ items: [item], settings: { ...DEFAULT_SETTINGS, language: "en" }, localImages: [] });
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
