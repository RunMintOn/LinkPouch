import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeMessage, RuntimeResponse } from "./messages";

interface Harness {
  local: Record<string, unknown>;
  session: Record<string, unknown>;
  command: (name: string) => Promise<void>;
  message: (message: RuntimeMessage, senderWindowId?: number) => Promise<RuntimeResponse>;
  openPopup: ReturnType<typeof vi.fn>;
  removedTabs: number[];
  createdTabs: string[];
  updatedTabs: Array<{ id: number; url?: string; active?: boolean }>;
}

async function createHarness(): Promise<Harness> {
  const local: Record<string, unknown> = {};
  const session: Record<string, unknown> = {};
  const removedTabs: number[] = [];
  const createdTabs: string[] = [];
  const updatedTabs: Array<{ id: number; url?: string; active?: boolean }> = [];
  const tab: chrome.tabs.Tab = {
    id: 7,
    index: 0,
    pinned: false,
    highlighted: true,
    active: true,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    lastAccessed: Date.now(),
    groupId: -1,
    windowId: 2,
    url: "https://www.example.com/story?from=test#intro",
    title: "Example story",
  };
  const queueTab: chrome.tabs.Tab = {
    ...tab,
    id: 8,
    windowId: 99,
    url: "chrome-extension://test/queue.html",
  };
  let commandListener: ((command: string) => void | Promise<void>) | undefined;
  let messageListener: ((message: RuntimeMessage, sender: chrome.runtime.MessageSender, respond: (response: RuntimeResponse) => void) => boolean) | undefined;
  const openPopup = vi.fn(async () => undefined);

  function storageArea(data: Record<string, unknown>) {
    return {
      get: vi.fn(async (key: string) => ({ [key]: data[key] })),
      set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, values); }),
      remove: vi.fn(async (key: string) => { delete data[key]; }),
    };
  }

  const fakeChrome = {
    storage: { local: storageArea(local), session: storageArea(session) },
    tabs: {
      query: vi.fn(async (query: chrome.tabs.QueryInfo) => {
        if (query.url) {
          return query.windowId === undefined || query.windowId === queueTab.windowId ? [queueTab] : [];
        }
        if (query.windowId !== undefined && query.windowId !== tab.windowId) return [];
        return [tab];
      }),
      get: vi.fn(async (id: number) => id === tab.id ? tab : Promise.reject(new Error("missing tab"))),
      update: vi.fn(async (id: number, properties: chrome.tabs.UpdateProperties) => {
        updatedTabs.push({ id, url: properties.url, active: properties.active });
        if (properties.url) tab.url = properties.url;
        return tab;
      }),
      create: vi.fn(async (properties: chrome.tabs.CreateProperties) => {
        createdTabs.push(properties.url ?? "");
        return tab;
      }),
      remove: vi.fn(async (id: number) => { removedTabs.push(id); }),
    },
    windows: { update: vi.fn(async () => undefined) },
    action: {
      openPopup,
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setBadgeText: vi.fn(async () => undefined),
    },
    commands: { onCommand: { addListener: vi.fn((listener: typeof commandListener) => { commandListener = listener; }) } },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: { addListener: vi.fn((listener: typeof messageListener) => { messageListener = listener; }) },
    },
  };

  Object.defineProperty(globalThis, "chrome", { value: fakeChrome, configurable: true });
  await import("./background");

  return {
    local,
    session,
    openPopup,
    removedTabs,
    createdTabs,
    updatedTabs,
    command: async (name) => { await commandListener?.(name); },
    message: (message, senderWindowId = tab.windowId) => new Promise((resolve) => {
      messageListener?.(message, { tab: { ...tab, windowId: senderWindowId } }, resolve);
    }),
  };
}

beforeEach(() => vi.resetModules());

describe("background browser workflow", () => {
  it("persists the active page before opening Quick Capture", async () => {
    const harness = await createHarness();
    await harness.command("capture-current-page");

    const items = harness.local.readingItems as Array<{ url: string; title: string }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://www.example.com/story?from=test#intro",
      title: "Example story",
    });
    expect(harness.session.captureSession).toMatchObject({ itemId: expect.any(String), sourceTabId: 7 });
    expect(harness.openPopup).toHaveBeenCalledOnce();
  });

  it("falls back for invalid stored appearance and language settings", async () => {
    const harness = await createHarness();
    harness.local.settings = { theme: "midnight", language: "fr" };

    const response = await harness.message({ type: "CAPTURE_ACTIVE_TAB" });

    expect(response.ok && response.settings).toMatchObject({ theme: "system", language: "zh-CN" });
  });

  it("focuses an existing tab with the same URL instead of creating one", async () => {
    const harness = await createHarness();

    await harness.message({ type: "OPEN_ITEM", url: "https://www.example.com/story?from=test#intro" });

    expect(harness.createdTabs).toEqual([]);
    expect(harness.updatedTabs).toContainEqual({ id: 7, url: undefined, active: true });
  });

  it("opens missing items in separate tabs without replacing earlier items", async () => {
    const harness = await createHarness();

    await harness.message({ type: "OPEN_ITEM", url: "https://example.com/item-a" });
    await harness.message({ type: "OPEN_ITEM", url: "https://example.com/item-b" });

    expect(harness.createdTabs).toEqual([
      "https://example.com/item-a",
      "https://example.com/item-b",
    ]);
    expect(harness.updatedTabs).toEqual([]);
  });

  it("focuses a queue page in another browser window by default", async () => {
    const harness = await createHarness();

    await harness.command("open-reading-queue");

    expect(harness.createdTabs).toEqual([]);
    expect(harness.updatedTabs).toContainEqual({ id: 8, url: undefined, active: true });
  });

  it("opens a separate queue page in the current window when configured", async () => {
    const harness = await createHarness();
    harness.local.settings = { queueOpenBehavior: "currentWindow" };

    await harness.command("open-reading-queue");

    expect(harness.createdTabs).toEqual(["chrome-extension://test/queue.html"]);
    expect(harness.updatedTabs).not.toContainEqual({ id: 8, url: undefined, active: true });
  });

  it("focuses an identical URL in another browser window by default", async () => {
    const harness = await createHarness();

    await harness.message({ type: "OPEN_ITEM", url: "https://www.example.com/story?from=test#intro" }, 99);

    expect(harness.createdTabs).toEqual([]);
    expect(harness.updatedTabs).toContainEqual({ id: 7, url: undefined, active: true });
  });

  it("limits reuse to the queue window when configured", async () => {
    const harness = await createHarness();
    harness.local.settings = { openBehavior: "queueWindow" };

    await harness.message({ type: "OPEN_ITEM", url: "https://www.example.com/story?from=test#intro" }, 99);

    expect(harness.createdTabs).toEqual(["https://www.example.com/story?from=test#intro"]);
    expect(harness.updatedTabs).toEqual([]);
  });

  it("closes the source tab only after confirmation when enabled", async () => {
    const harness = await createHarness();
    harness.local.settings = { closeAfterCapture: true };
    await harness.command("capture-current-page");
    const item = (harness.local.readingItems as Array<{ id: string }>)[0];

    const response = await harness.message({ type: "CONFIRM_CAPTURE", itemId: item.id, note: "Read for project", sourceTabId: 7 });

    expect(response.ok).toBe(true);
    expect(harness.removedTabs).toEqual([7]);
    expect((harness.local.readingItems as Array<{ note: string }>)[0].note).toBe("Read for project");
  });
});
