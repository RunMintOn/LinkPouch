import type { ReadingItem } from "./domain";

export interface ImageDirectory {
  id: string;
  handle: FileSystemDirectoryHandle;
}

export interface LocalImage {
  id: string;
  directoryId: string;
  fileName: string;
  itemId: string;
  sourceUrl: string;
  title: string;
  alt: string;
  createdAt: number;
}

// Directory handles are structured-cloneable in IndexedDB, not chrome.storage.
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("linkpouch-files", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("handles");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function getImageDirectory(): Promise<ImageDirectory | undefined> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction("handles").objectStore("handles").get("images");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function chooseImageDirectory(): Promise<ImageDirectory> {
  const handle = await window.showDirectoryPicker({ id: "linkpouch-images", mode: "readwrite" });
  const directory = { id: crypto.randomUUID(), handle };
  const db = await database;
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("handles", "readwrite");
    transaction.objectStore("handles").put(directory, "images");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  return directory;
}

export async function getLocalImages(): Promise<LocalImage[]> {
  const { localImages = [] } = await chrome.storage.local.get("localImages");
  return localImages as LocalImage[];
}

export async function savePostImages(item: ReadingItem, directory: ImageDirectory, onProgress: (done: number) => void): Promise<void> {
  const postId = new URL(item.url).pathname.match(/\/status\/(\d+)/)?.[1] ?? item.id;
  const images = item.images ?? [];
  for (const [index, image] of images.entries()) {
    const url = new URL(image.url);
    if (url.hostname === "pbs.twimg.com") url.searchParams.set("name", "orig");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url.href}`);
    const blob = await response.blob();
    const extension = url.searchParams.get("format") ?? url.pathname.split(".").pop() ?? "jpg";
    const fileName = `${postId}-${index + 1}.${extension}`;
    const file = await directory.handle.getFileHandle(fileName, { create: true });
    const writer = await file.createWritable();
    await writer.write(blob);
    await writer.close();
    const record: LocalImage = {
      id: `${directory.id}/${fileName}`,
      directoryId: directory.id, fileName, itemId: item.id, sourceUrl: item.url,
      title: item.title, alt: image.alt, createdAt: Date.now(),
    };
    const saved = await getLocalImages();
    await chrome.storage.local.set({ localImages: [record, ...saved.filter(({ id }) => id !== record.id)] });
    onProgress(index + 1);
  }
}
