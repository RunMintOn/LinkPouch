import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadingItem } from "./domain";
import { stubWebLocks } from "./test/web-locks";
import { storageArea } from "./test/storage";

function item(id: string): ReadingItem {
  return {
    id, url: `https://example.com/${id}`, title: id, domain: "example.com",
    note: "", createdAt: 1, queuedAt: 1, doneAt: null, deletedAt: null,
  };
}

let local: Record<string, unknown>;
let repository: typeof import("./repository");

beforeEach(async () => {
  vi.resetModules();
  stubWebLocks();
  local = { readingItems: [item("a"), item("b")] };
  vi.stubGlobal("chrome", { storage: { local: storageArea(local) } });
  repository = await import("./repository");
});

afterEach(() => vi.unstubAllGlobals());

describe("collection writes", () => {
  it("preserves both notes when different items are edited concurrently", async () => {
    await Promise.all([
      repository.updateItem("a", (saved) => ({ ...saved, note: "First note" })),
      repository.updateItem("b", (saved) => ({ ...saved, note: "Second note" })),
    ]);

    expect((await repository.getItems()).map(({ id, note }) => ({ id, note }))).toEqual([
      { id: "a", note: "First note" },
      { id: "b", note: "Second note" },
    ]);
  });

  it("does not resurrect a deleted item or undo another item's concurrent edit", async () => {
    await Promise.all([
      repository.updateItem("a", (saved) => ({ ...saved, note: "Keep this edit" })),
      repository.removeItem("b"),
    ]);

    expect(await repository.getItems()).toEqual([{ ...item("a"), note: "Keep this edit" }]);
  });

  it("does not let an in-flight edit overwrite a later backup restore", async () => {
    await repository.getItems();
    let releaseWrite!: () => void;
    let signalWrite!: () => void;
    const paused = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const started = new Promise<void>((resolve) => { signalWrite = resolve; });
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(async (values) => {
      signalWrite();
      await paused;
      Object.assign(local, structuredClone(values));
    });

    const editing = repository.updateItem("a", (saved) => ({ ...saved, note: "Before restore" }));
    await started;
    const restoring = repository.restoreBackup([item("restored")], undefined);
    releaseWrite();
    await Promise.all([editing, restoring]);

    expect(await repository.getItems()).toEqual([item("restored")]);
  });

  it("reads and writes only the edited record after initial loading", async () => {
    await repository.getItems();
    vi.mocked(chrome.storage.local.get).mockClear();
    vi.mocked(chrome.storage.local.set).mockClear();
    await repository.updateItem("a", (saved) => ({ ...saved, note: "Small edit" }));

    expect(vi.mocked(chrome.storage.local.get).mock.calls).toEqual([["item:a"]]);
    expect(vi.mocked(chrome.storage.local.set).mock.calls).toEqual([[{ "item:a": { ...item("a"), note: "Small edit" } }]]);
  });

  it("retains legacy data on migration failure and retries without losing records", async () => {
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("Write failed"));
    await expect(repository.getItems()).rejects.toThrow("Write failed");
    expect(local.readingItems).toEqual([item("a"), item("b")]);

    expect(await repository.getItems()).toEqual([item("a"), item("b")]);
    expect(local.readingItems).toBeUndefined();
  });
});
