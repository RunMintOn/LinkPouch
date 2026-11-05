import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { realpathSync, readdirSync, existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = realpathSync(execFileSync("which", ["playwright-cli"], { encoding: "utf8" }).trim());
const { chromium } = createRequire(cli)("playwright");
const cache = join(homedir(), "Library/Caches/ms-playwright");
const executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name))
  .map((name) => join(cache, name, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))
  .find(existsSync);
const extension = resolve("dist");
const profile = await mkdtemp(join(tmpdir(), "linkpouch-smoke-"));
const context = await chromium.launchPersistentContext(profile, {
  executablePath, headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1280, height: 900 },
});
const errors = [];
context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));

const paragraphs = [
  "第一段译文：我保存的是有价值的内容，而不是为了清空阅读队列。",
  "第二段译文：不同的选段必须各自保留，即使来自同一个网页。",
  ...Array.from({ length: 5 }, (_, i) => `第 ${i + 3} 段。${"A local collection keeps useful context available without requiring manual organization. ".repeat(14)}`),
  "只有正文里存在的检索关键词：星际花园。",
];
const article = `<!doctype html><html lang="zh"><head><title>保存与找回</title></head><body><main><article>
  <h1>保存与找回</h1>${paragraphs.map((text, i) => `<p id="p${i}">${text}</p>`).join("")}
  </article></main></body></html>`;
const tweet = (author, id, text, images = "") => `<div data-testid="cellInnerDiv"><article data-testid="tweet">
  <div data-testid="User-Name"><a href="/${author}">${author}</a><a href="/${author}">@${author}</a><a href="/${author}/status/${id}"><time datetime="2026-01-02T03:04:05Z">Jan 2</time></a></div>
  <div data-testid="tweetText">${text}</div>${images}</article></div>`;
const xPost = `<!doctype html><html><head><title>插画收藏</title></head><body>
  <style>body{font:16px system-ui;margin:40px auto;width:640px}article{padding:20px 0} [data-testid="tweetPhoto"]{display:flex;width:600px;height:300px;margin-top:16px;background:#eee} [data-testid="tweetPhoto"] img{width:50%;height:100%;object-fit:cover}</style>
  ${tweet("artist", "1001", "一些值得收藏的插画", '<div data-testid="tweetPhoto"><img alt="花园插画" src="https://pbs.twimg.com/media/garden?format=png&name=small"><img alt="夜空插画" src="https://pbs.twimg.com/media/night?format=png&name=small"></div>')}
  ${tweet("reader", "1002", "这条评论不应该被保存")}
  </body></html>`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=", "base64");
const downloadedUrls = [];
await context.route("https://x.com/**", (route) => route.fulfill({
  contentType: "text/html; charset=utf-8", body: route.request().url().includes("/status/") ? xPost : article,
}));
await context.route("https://pbs.twimg.com/**", (route) => {
  downloadedUrls.push(route.request().url());
  return route.fulfill({ contentType: "image/png", body: png });
});

try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const root = `chrome-extension://${extensionId}`;
  const collection = await context.newPage();
  await collection.goto(`${root}/queue.html`);
  const source = await context.newPage();
  await source.goto("https://x.com/test-article");
  const capture = () => collection.evaluate(() => chrome.runtime.sendMessage({ type: "CAPTURE_ACTIVE_TAB" }));
  const full = await capture();
  assert.equal(full.ok, true);
  assert.equal(full.item.content.kind, "page");
  assert.match(full.item.content.text, /星际花园/);
  assert.equal(full.item.images.length, 0);
  console.log("PASS: actual content script + Defuddle saves article body without downloading images");

  for (const index of [0, 1]) {
    await source.evaluate((i) => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(`#p${i}`));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }, index);
    const clip = await capture();
    assert.equal(clip.ok, true);
    assert.equal(clip.item.content.kind, "selection");
    assert.equal(clip.item.content.text, paragraphs[index]);
  }
  assert.equal((await collection.evaluate(() => chrome.storage.local.get("readingItems"))).readingItems.length, 3);
  console.log("PASS: two selections at the same URL remain independent");

  await collection.bringToFront();
  await collection.reload();
  await collection.getByPlaceholder("按 / 搜索正文、标题或备注").fill("星际花园");
  await collection.locator(".queue-item").waitFor();
  assert.equal(await collection.locator(".queue-item").count(), 1);
  await collection.locator(".queue-item").hover();
  await collection.getByRole("button", { name: "查看内容" }).click();
  await collection.locator(".saved-content").waitFor();
  await collection.screenshot({ path: "/tmp/linkpouch-content.png", fullPage: true });
  console.log("PASS: body search and saved-content view");

  await collection.evaluate(async ({ itemId, sourceTabId }) => {
    await chrome.storage.session.set({ captureSession: { itemId, sourceTabId, startedAt: Date.now(), outcome: "created" } });
  }, { itemId: full.item.id, sourceTabId: full.session.sourceTabId });
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 560, height: 700 });
  await popup.goto(`${root}/popup.html`);
  await popup.getByText("已保存正文", { exact: false }).waitFor();
  await popup.screenshot({ path: "/tmp/linkpouch-popup.png", fullPage: true });
  console.log("PASS: popup previews the actual saved body");
  await popup.close();

  // Use a native directory handle from OPFS to exercise read/write and persisted
  // handles headlessly. The external-directory picker itself is not automated.
  await collection.evaluate(async () => {
    const parent = await navigator.storage.getDirectory();
    const handle = await parent.getDirectoryHandle("smoke-images", { create: true });
    await new Promise((resolve, reject) => {
      const open = indexedDB.open("linkpouch-files", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("handles");
      open.onsuccess = () => {
        const transaction = open.result.transaction("handles", "readwrite");
        transaction.objectStore("handles").put({ id: "smoke-directory", handle }, "images");
        transaction.oncomplete = () => { open.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await source.goto("https://x.com/artist/status/1001");
  await source.locator('[data-testid="tweetPhoto"]').hover();
  const imageButton = source.getByRole("button", { name: "↓ 收图 · 2" });
  await imageButton.waitFor();
  const placement = await imageButton.evaluate((button) => {
    const group = button.parentElement.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    return { position: getComputedStyle(button).position, opacity: getComputedStyle(button).opacity, top: rect.top - group.top, right: group.right - rect.right };
  });
  assert.deepEqual(placement, { position: "absolute", opacity: "1", top: 8, right: 8 });
  await source.screenshot({ path: "/tmp/linkpouch-image-button.png" });
  await source.evaluate(() => {
    window.photoOpened = false;
    document.querySelector('[data-testid="tweetPhoto"]').addEventListener("click", () => { window.photoOpened = true; });
  });
  await imageButton.click();
  assert.equal(await source.evaluate(() => window.photoOpened), false);
  await collection.getByRole("heading", { name: "画廊", exact: true }).waitFor();
  await collection.getByText("已保存 2 张图片", { exact: true }).waitFor();
  assert.equal(await collection.locator(".gallery-tile").count(), 2);
  await collection.locator(".gallery-tile img").first().waitFor();
  await collection.screenshot({ path: "/tmp/linkpouch-gallery.png", fullPage: true });
  const stored = await collection.evaluate(async () => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("smoke-images");
    const files = [];
    for await (const [name, handle] of directory.entries()) files.push({ name, size: (await handle.getFile()).size });
    return { files, local: await chrome.storage.local.get(null) };
  });
  assert.deepEqual(stored.files.map((file) => file.name).sort(), ["1001-1.png", "1001-2.png"]);
  assert.ok(stored.files.every((file) => file.size === png.length));
  assert.equal(stored.local.localImages.length, 2);
  assert.ok(stored.local.localImages.every((image) => !("blob" in image) && !("data" in image)));
  const savedPost = stored.local.readingItems.find((item) => item.url.includes("/status/1001"));
  assert.ok(savedPost.doneAt);
  assert.ok(!savedPost.content.text.includes("这条评论"));
  assert.equal(downloadedUrls.filter((url) => url.includes("name=orig")).length, 2);
  await collection.locator(".gallery-image").first().click();
  assert.equal(await collection.locator("dialog[open]").count(), 1);
  await collection.keyboard.press("Escape");
  await collection.reload();
  await collection.getByRole("button", { name: "画廊", exact: true }).click();
  await collection.locator(".gallery-tile img").first().waitFor();
  console.log("PASS: X button -> original image files -> gallery -> zoom -> reload; no reply or unread task");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "PASS", profile, screenshots: ["/tmp/linkpouch-content.png", "/tmp/linkpouch-popup.png", "/tmp/linkpouch-gallery.png", "/tmp/linkpouch-image-button.png"] }, null, 2));
} finally {
  await context.close();
}
