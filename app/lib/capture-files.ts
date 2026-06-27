// Pulls image File objects out of a drop (DataTransfer.files) or a paste
// (DataTransfer.items, where each file item needs getAsFile()). Non-images are
// ignored. Source is the loose shape both events expose.

interface FileItem {
  kind: string;
  type: string;
  getAsFile(): File | null;
}

interface TransferLike {
  files?: ArrayLike<File>;
  items?: ArrayLike<FileItem>;
}

const isImage = (type: string) => type.startsWith("image/");

export function imageFilesFrom(dt: TransferLike): File[] {
  const out: File[] = [];

  if (dt.files) {
    for (const f of Array.from(dt.files)) {
      if (isImage(f.type)) out.push(f);
    }
  }

  if (out.length === 0 && dt.items) {
    for (const it of Array.from(dt.items)) {
      if (it.kind === "file" && isImage(it.type)) {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
  }

  return out;
}
