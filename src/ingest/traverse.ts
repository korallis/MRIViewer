export interface FoundFile {
  file: File;
  path: string;
}

/**
 * Folder traversal (PLAN §5.1).
 * - Drop handler must map ALL items to handles/entries SYNCHRONOUSLY in the
 *   drop tick — any await first makes later items resolve null (MDN).
 * - readEntries() returns ≤100 entries per call in Chromium — loop until empty.
 */
export async function filesFromDataTransfer(items: DataTransferItemList): Promise<FoundFile[]> {
  const mapped = Array.from(items)
    .filter((i) => i.kind === 'file')
    .map((i) => {
      const withHandle = i as DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
      };
      if (typeof withHandle.getAsFileSystemHandle === 'function') {
        return { kind: 'handle' as const, promise: withHandle.getAsFileSystemHandle() };
      }
      return { kind: 'entry' as const, entry: i.webkitGetAsEntry() };
    });

  const out: FoundFile[] = [];
  for (const m of mapped) {
    if (m.kind === 'handle') {
      const handle = await m.promise;
      if (handle) await walkHandle(handle, '', out);
    } else if (m.entry) {
      await walkEntry(m.entry, out);
    }
  }
  return out;
}

async function walkHandle(handle: FileSystemHandle, prefix: string, out: FoundFile[]): Promise<void> {
  if (handle.kind === 'file') {
    const file = await (handle as FileSystemFileHandle).getFile();
    out.push({ file, path: prefix + handle.name });
    return;
  }
  // .values() is in the File System Access spec but missing from TS's DOM lib.
  const dir = handle as FileSystemDirectoryHandle & {
    values(): AsyncIterableIterator<FileSystemHandle>;
  };
  for await (const child of dir.values()) {
    await walkHandle(child, `${prefix}${handle.name}/`, out);
  }
}

async function walkEntry(entry: FileSystemEntry, out: FoundFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ file, path: entry.fullPath.replace(/^\//, '') });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // Chromium caps each readEntries() at 100 entries — loop until empty batch.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, out);
    }
  }
}

export function filesFromFileList(list: FileList): FoundFile[] {
  return Array.from(list).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function filesFromDirectoryPicker(): Promise<FoundFile[]> {
  const picker = (
    window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker;
  const dir = await picker();
  const out: FoundFile[] = [];
  await walkHandle(dir, '', out);
  return out;
}
