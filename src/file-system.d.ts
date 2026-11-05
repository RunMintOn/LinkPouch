interface FileSystemHandle {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker(options: { id: string; mode: "readwrite" }): Promise<FileSystemDirectoryHandle>;
}
