import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { realpathSync, readdirSync, existsSync } from "node:fs";
import { cp, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";

const cli = realpathSync(execFileSync("which", ["playwright-cli"], { encoding: "utf8" }).trim());
const { chromium } = createRequire(cli)("playwright");
const cache = join(homedir(), "Library/Caches/ms-playwright");
const executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name))
  .map((name) => join(cache, name, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))
  .find(existsSync);
const output = await mkdtemp(join(tmpdir(), "linkpouch-storage-"));
const extension = join(output, "extension");
await cp(resolve("dist"), extension, { recursive: true });
await writeFile(join(extension, "storage-test.html"), "<!doctype html><title>Isolated storage test</title>");
// Exercise the public repository/backup functions without depending on hashed
// application chunks. These entry points exist only in the temporary extension.
await build({
  configFile: false, publicDir: false, logLevel: "error",
  build: {
    outDir: extension, emptyOutDir: false,
    lib: {
      entry: { repository: resolve("src/repository.ts"), backups: resolve("src/automatic-backup.ts"), directories: resolve("src/directories.ts") },
      formats: ["es"], fileName: (_format, name) => `test-${name}.js`,
    },
  },
});
const launchOptions = {
  executablePath, headless: true, offline: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
};
let context = await chromium.launchPersistentContext(join(output, "profile"), launchOptions);
const errors = [];
context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
const items = Array.from({ length: 300 }, (_, i) => ({
  id: `fixture-${i}`, url: `https://example.invalid/${i}`, domain: "example.invalid", title: `Fixture ${i}`,
  note: "", createdAt: i + 1, queuedAt: i + 1, doneAt: null, deletedAt: null,
  content: { kind: "page", html: `<p>Saved body ${i}</p>`, text: i === 0 ? "needle-last" : `Saved body ${i}` },
}));
const image = {
  id: "image-directory/keep.png", directoryId: "image-directory", fileName: "keep.png", itemId: items[0].id,
  sourceUrl: items[0].url, title: items[0].title, alt: "Saved image", createdAt: 1,
};
const byId = (values) => [...values].sort((a, b) => a.id.localeCompare(b.id));
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const root = `chrome-extension://${new URL(worker.url()).host}`;
  const control = await context.newPage();
  await control.goto(`${root}/storage-test.html`);
  await control.evaluate(async () => {
    window.repository = await import("./test-repository.js");
    window.backups = await import("./test-backups.js");
    window.directories = await import("./test-directories.js");
  });
  await control.evaluate(async ({ items, image }) => {
    await chrome.storage.local.set({ readingItems: items, settings: { theme: "light" }, localImages: [image] });
    const root = await navigator.storage.getDirectory();
    const handle = await root.getDirectoryHandle("image-files", { create: true });
    const writer = await (await handle.getFileHandle("keep.png", { create: true })).createWritable();
    await writer.write(Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII="), (char) => char.charCodeAt(0)));
    await writer.close();
    await window.directories.saveDirectory("images", { id: "image-directory", handle });
  }, { items, image });
  assert.deepEqual(byId(await control.evaluate(() => window.repository.getItems())), byId(items));
  assert.equal(await control.evaluate(async () => "readingItems" in await chrome.storage.local.get(null)), false);
  console.log("PASS: legacy collection migrates exactly, without retaining a duplicate array");

  const collection = await context.newPage();
  await collection.addInitScript(() => {
    const originalGet = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = async (...args) => {
      const snapshot = await originalGet(...args);
      if (args[0] === null && !window.initialSnapshotPaused) {
        window.initialSnapshotPaused = true;
        await new Promise((resolve) => { window.releaseInitialSnapshot = resolve; });
      }
      return snapshot;
    };
    chrome.storage.onChanged.addListener((changes) => {
      if (changes["item:fixture-299"]?.newValue?.title === "Updated while opening") window.initialUpdateSeen = true;
    });
  });
  await collection.goto(`${root}/queue.html`);
  await collection.waitForFunction(() => window.initialSnapshotPaused);
  await control.evaluate(() => window.repository.updateItem("fixture-299", (item) => ({ ...item, title: "Updated while opening" })));
  await collection.waitForFunction(() => window.initialUpdateSeen);
  await collection.evaluate(() => window.releaseInitialSnapshot());
  await collection.waitForFunction(() => document.querySelectorAll(".queue-item").length === 100);
  assert.match(await collection.locator("#queue-card-fixture-299").innerText(), /Updated while opening/);
  await control.evaluate(() => window.repository.updateItem("fixture-299", (item) => ({ ...item, title: "Fixture 299" })));
  await collection.getByRole("button", { name: "查看内容: Fixture 299", exact: true }).waitFor();
  const search = collection.getByPlaceholder("按 / 搜索正文、标题或备注");
  await search.fill("needle-last");
  await collection.waitForFunction(() => document.querySelectorAll(".queue-item").length === 1);
  assert.match(await collection.locator(".queue-item").innerText(), /Fixture 0/);
  await search.fill("Fixture");
  await collection.waitForFunction(() => document.querySelectorAll(".queue-item").length === 100);
  for (let i = 0; i < 101; i++) await search.press("ArrowDown");
  assert.equal(await search.getAttribute("aria-activedescendant"), "queue-card-fixture-199");
  await search.press("Enter");
  await collection.locator(".item-detail").getByRole("heading", { name: "Fixture 199", exact: true }).waitFor();
  await collection.keyboard.press("Escape");
  console.log("PASS: bounded first render, full-collection body search, and keyboard browsing across batches");

  await collection.getByRole("button", { name: "设置", exact: true }).click();
  await collection.evaluate(() => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("backup-files", { create: true });
  });
  await collection.getByRole("button", { name: "选择备份目录", exact: true }).click();
  await collection.getByText(/最近备份：/).waitFor();
  await collection.screenshot({ path: join(output, "settings.png"), fullPage: true });
  const downloadEvent = collection.waitForEvent("download");
  await collection.getByRole("button", { name: "导出备份", exact: true }).click();
  const download = await downloadEvent;
  const backupPath = await download.path();
  const exported = JSON.parse(await readFile(backupPath, "utf8"));
  assert.deepEqual(byId(exported.readingItems), byId(items));
  assert.deepEqual(exported.localImages, [image]);
  assert.equal(exported.imageDirectoryId, "image-directory");
  assert.equal(exported.settings.theme, "light");

  await control.evaluate(() => window.repository.updateItem("fixture-0", (item) => ({ ...item, note: "Automatic backup follows edits" })));
  await control.waitForFunction(async () => {
    const directory = await window.directories.getDirectory("backups");
    for await (const [, file] of directory.handle.entries()) {
      const saved = JSON.parse(await (await file.getFile()).text());
      if (saved.readingItems.find((item) => item.id === "fixture-0")?.note === "Automatic backup follows edits") return true;
    }
    return false;
  });
  // Move only the clock's weekday at the platform boundary, not the retention
  // implementation; eight backups must occupy seven files rather than grow.
  const slots = await control.evaluate(async () => {
    const originalDay = Date.prototype.getDay;
    try {
      for (let i = 0; i < 8; i++) {
        Date.prototype.getDay = () => i % 7;
        await window.backups.backupNow();
      }
    } finally { Date.prototype.getDay = originalDay; }
    const directory = await window.directories.getDirectory("backups");
    const files = [];
    for await (const [name] of directory.handle.entries()) files.push(name);
    return files;
  });
  assert.equal(slots.length, 7);
  const lastSuccess = await control.evaluate(async () => (await window.backups.getBackupStatus()).lastSuccessAt);
  await control.evaluate(async () => {
    const original = FileSystemDirectoryHandle.prototype.queryPermission;
    FileSystemDirectoryHandle.prototype.queryPermission = async () => "denied";
    try { await window.backups.backupNow(); }
    finally { FileSystemDirectoryHandle.prototype.queryPermission = original; }
  });
  assert.deepEqual(await control.evaluate(() => window.backups.getBackupStatus()), { lastSuccessAt: lastSuccess, error: "permission" });
  await collection.getByText("自动备份已暂停，请重新授权目录访问。").waitFor();
  await collection.getByRole("button", { name: "授权目录访问", exact: true }).click();
  await collection.getByText("自动备份已暂停，请重新授权目录访问。").waitFor({ state: "detached" });
  const successBeforeFailure = await control.evaluate(async () => (await window.backups.getBackupStatus()).lastSuccessAt);
  await control.evaluate(async () => {
    const original = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async () => { throw new Error("Disk write failed"); };
    try { await window.backups.backupNow(); }
    finally { FileSystemFileHandle.prototype.createWritable = original; }
  });
  assert.deepEqual(await control.evaluate(() => window.backups.getBackupStatus()), { lastSuccessAt: successBeforeFailure, error: "write" });
  await collection.getByText("自动备份失败，请检查目录是否可写。").waitFor();
  await collection.getByRole("button", { name: "设置 · 备份暂停", exact: true }).waitFor();
  await control.evaluate(() => window.backups.backupNow());
  await collection.getByText("自动备份失败，请检查目录是否可写。").waitFor({ state: "detached" });
  console.log("PASS: manual export includes image sources; background autosave writes files; seven-slot retention and permission recovery");

  await control.evaluate(async () => {
    await window.repository.restoreBackup([], undefined, { localImages: [] });
    const other = await (await navigator.storage.getDirectory()).getDirectoryHandle("unrelated-files", { create: true });
    await window.directories.saveDirectory("images", { id: "unrelated-directory", handle: other });
    await chrome.storage.local.remove("imageDirectoryId");
  });
  collection.once("dialog", (dialog) => dialog.accept());
  await collection.locator('input[type="file"]').setInputFiles(backupPath);
  await collection.getByText("已恢复 300 条阅读项", { exact: true }).waitFor();
  assert.deepEqual(byId(await control.evaluate(() => window.repository.getItems())), byId(items));
  assert.deepEqual(await control.evaluate(async () => (await chrome.storage.local.get("localImages")).localImages), [image]);
  await collection.evaluate(() => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("image-files");
  });
  await collection.getByRole("button", { name: "画廊", exact: true }).click();
  await collection.getByRole("button", { name: "选择图片目录", exact: true }).click();
  await collection.locator(".gallery-tile img").waitFor();
  assert.equal(await collection.locator(".gallery-tile").count(), 1);
  assert.equal(await collection.locator(".gallery-tile a").getAttribute("href"), items[0].url);
  await collection.screenshot({ path: join(output, "restored-gallery.png") });
  console.log("PASS: restore recovers the collection and image sources; reselecting the original folder reconnects existing files");
  // Close before the debounce fires. The persisted edit must be backed up on
  // browser startup, even though no collection page has been opened.
  await control.evaluate(() => window.repository.updateItem("fixture-0", (item) => ({ ...item, note: "Saved just before restart" })));
  await context.close();
  context = await chromium.launchPersistentContext(join(output, "profile"), launchOptions);
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const startup = await context.newPage();
  await startup.goto(`${root}/storage-test.html`);
  await startup.evaluate(async () => { window.directories = await import("./test-directories.js"); });
  await startup.waitForFunction(async () => {
    const directory = await window.directories.getDirectory("backups");
    for await (const [, file] of directory.handle.entries()) {
      const saved = JSON.parse(await (await file.getFile()).text());
      if (saved.readingItems.find((item) => item.id === "fixture-0")?.note === "Saved just before restart") return true;
    }
    return false;
  });
  console.log("PASS: browser startup backs up edits persisted immediately before shutdown");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "PASS", output, screenshots: ["settings.png", "restored-gallery.png"] }, null, 2));
} finally {
  await context.close();
}
