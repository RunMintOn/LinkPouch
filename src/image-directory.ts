import type { LocalImage, ReadingItem } from "./domain";
import { withStorageWrite } from "./repository";
import { getDirectory, saveDirectory, type SavedDirectory } from "./directories";
export type { LocalImage } from "./domain";
export type ImageDirectory = SavedDirectory;

export const getImageDirectory = () => getDirectory("images");

export async function chooseImageDirectory(): Promise<ImageDirectory> {
  const handle = await window.showDirectoryPicker({ id: "linkpouch-images", mode: "readwrite" });
  return withStorageWrite(async () => {
    const { imageDirectoryId } = await chrome.storage.local.get("imageDirectoryId");
    const directory = { id: typeof imageDirectoryId === "string" ? imageDirectoryId : crypto.randomUUID(), handle };
    await saveDirectory("images", directory);
    await chrome.storage.local.set({ imageDirectoryId: directory.id });
    return directory;
  });
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
    await withStorageWrite(async () => {
      const saved = await getLocalImages();
      await chrome.storage.local.set({ localImages: [record, ...saved.filter(({ id }) => id !== record.id)] });
    });
    onProgress(index + 1);
  }
}
