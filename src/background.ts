import { captureItem, type CapturedPage } from "./domain";
import { t } from "./i18n";
import type { RuntimeMessage, RuntimeResponse, CaptureSession } from "./messages";
import {
  getCaptureSession,
  clearCaptureSession,
  getItems,
  getSettings,
  setCaptureSession,
  setItems,
  updateItem,
} from "./repository";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCapturable(url?: string): url is string {
  return Boolean(url && (url.startsWith("http://") || url.startsWith("https://")));
}

async function captureActiveTab(sourceTab?: chrome.tabs.Tab, intent: "capture" | "images" = "capture"): Promise<CaptureSession> {
  const tab = sourceTab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const startedAt = Date.now();
  if (!tab?.id || !isCapturable(tab.url)) {
    const session = { startedAt, error: t((await getSettings()).language, "background.captureUnavailable") };
    await setCaptureSession(session);
    return session;
  }

  let page: CapturedPage = { url: tab.url, title: tab.title ?? tab.url };
  let extractionError: string | undefined;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["assets/content.js"] });
    const extracted = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE", useSelection: intent === "capture" });
    if (!extracted.ok) throw new Error(extracted.error);
    page = extracted.page;
  } catch (error) {
    extractionError = errorMessage(error);
  }
  const items = await getItems();
  const result = captureItem(items, page, startedAt);
  if (intent === "images") {
    // Collecting images preserves the source without creating a reading task.
    const previous = items.find((item) => item.id === result.item.id);
    result.item.doneAt = previous ? previous.doneAt : startedAt;
    result.item.deletedAt = previous?.deletedAt ?? null;
    result.item.queuedAt = previous?.queuedAt ?? startedAt;
  }
  await setItems(result.items);
  const session: CaptureSession = {
    itemId: result.item.id,
    sourceTabId: tab.id,
    outcome: result.outcome,
    startedAt,
    extractionError,
  };
  await setCaptureSession(session);
  return session;
}

async function openCapturePopup(session: CaptureSession): Promise<void> {
  const tab = session.sourceTabId ? await chrome.tabs.get(session.sourceTabId).catch(() => undefined) : undefined;
  try {
    await chrome.action.openPopup(tab?.windowId ? { windowId: tab.windowId } : undefined);
  } catch {
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    await chrome.action.setBadgeText({ text: session.error ? "!" : "✓", tabId: session.sourceTabId });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: session.sourceTabId }).catch(() => undefined), 1800);
  }
}

async function openQueue(itemId?: string, download = false): Promise<void> {
  const queueUrl = chrome.runtime.getURL("queue.html");
  const targetUrl = itemId ? `${queueUrl}?${download ? "download" : "item"}=${encodeURIComponent(itemId)}${download ? "#gallery" : ""}` : queueUrl;
  const settings = await getSettings();
  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const currentWindowId = currentTab?.windowId;
  const query = settings.queueOpenBehavior === "currentWindow" && currentWindowId !== undefined
    ? { url: `${queueUrl}*`, windowId: currentWindowId }
    : { url: `${queueUrl}*` };
  const [existing] = await chrome.tabs.query(query);
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, ...(itemId ? { url: targetUrl } : {}) });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: targetUrl, active: true, windowId: currentWindowId });
}

async function focusTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

async function openItem(url: string, queueWindowId?: number): Promise<void> {
  const settings = await getSettings();
  const query = settings.openBehavior === "allWindows"
    ? {}
    : settings.openBehavior === "queueWindow" && queueWindowId !== undefined
      ? { windowId: queueWindowId }
      : undefined;
  if (query) {
    const existing = (await chrome.tabs.query(query)).find((tab) => tab.url === url);
    if (existing) {
      await focusTab(existing);
      return;
    }
  }

  await chrome.tabs.create({ url, active: true, windowId: queueWindowId });
}

async function handleMessage(message: RuntimeMessage, sender?: chrome.runtime.MessageSender): Promise<RuntimeResponse> {
  try {
    if (message.type === "CAPTURE_ACTIVE_TAB") {
      const pending = await getCaptureSession();
      const session = pending && Date.now() - pending.startedAt < 10_000 ? pending : await captureActiveTab();
      await clearCaptureSession();
      if (session.error) return { ok: false, error: session.error };
      const item = (await getItems()).find(({ id }) => id === session.itemId);
      return { ok: true, session, item, settings: await getSettings() };
    }
    if (message.type === "CONFIRM_CAPTURE") {
      const item = await updateItem(message.itemId, (current) => ({ ...current, note: message.note }));
      if (!item) return { ok: false, error: t((await getSettings()).language, "background.itemNotFound") };
      const settings = await getSettings();
      await chrome.storage.session.remove("captureSession");
      if (settings.closeAfterCapture && message.sourceTabId !== undefined) {
        const tab = await chrome.tabs.get(message.sourceTabId).catch(() => undefined);
        if (tab && !tab.pinned) await chrome.tabs.remove(message.sourceTabId).catch(() => undefined);
      }
      return { ok: true, item, settings };
    }
    if (message.type === "OPEN_ITEM") {
      await openItem(message.url, sender?.tab?.windowId);
      return { ok: true };
    }
    if (message.type === "OPEN_QUEUE") {
      await openQueue(message.itemId, message.download);
      return { ok: true };
    }
    if (message.type === "DOWNLOAD_POST_IMAGES") {
      const session = await captureActiveTab(sender?.tab, "images");
      await clearCaptureSession();
      if (session.error) return { ok: false, error: session.error };
      await openQueue(session.itemId, true);
      return { ok: true };
    }
    return { ok: false, error: t((await getSettings()).language, "background.unknownOperation") };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "capture-current-page") await openCapturePopup(await captureActiveTab());
  if (command === "open-reading-queue") await openQueue();
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void handleMessage(message, sender).then(sendResponse);
  return true;
});
