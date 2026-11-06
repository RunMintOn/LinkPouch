export interface SavedDirectory {
  id: string;
  handle: FileSystemDirectoryHandle;
}

// Handles are structured-cloneable in IndexedDB, but cannot go in JSON backups.
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("linkpouch-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}

export async function getDirectory(key: "images" | "backups"): Promise<SavedDirectory | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("handles").objectStore("handles").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDirectory(key: "images" | "backups", directory: SavedDirectory | undefined): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("handles", "readwrite");
    const store = transaction.objectStore("handles");
    if (directory) store.put(directory, key);
    else store.delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
  });
}
