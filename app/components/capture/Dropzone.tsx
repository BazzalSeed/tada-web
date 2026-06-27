"use client";

import { useRef, useState, type ReactNode } from "react";
import { imageFilesFrom } from "@/app/lib/capture-files";
import styles from "./Dropzone.module.css";

// Drag-and-drop capture surface. Wraps content; on image drop it emits the
// files. A soft overlay (rust dashed frame) appears while dragging — never a
// heavy fill. Also offers a click-to-upload affordance (a hidden file input)
// so capture works without drag/paste. Paste is handled globally by CaptureZone.
export interface DropzoneProps {
  onFiles: (files: File[]) => void;
  children: ReactNode;
}

function imagesFromList(list: FileList | null): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

// Only a real FILE drag (from the OS / clipboard) carries the "Files" type. An
// in-app element drag — e.g. a todo-row reorder — does NOT, so we must ignore it
// here: otherwise the capture overlay ("Drop image to capture") + dashed frame
// hijack the row drag and swallow the drop (FIX6). Defaults to true when types
// are unavailable (older browsers) so genuine file drops aren't missed.
function isFileDrag(dt: DataTransfer | null): boolean {
  const types = dt?.types;
  if (!types) return true;
  return Array.from(types).includes("Files");
}

export function Dropzone({ onFiles, children }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0); // track nested dragenter/leave
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      data-testid="dropzone"
      data-dragging={dragging}
      className={styles.zone}
      onDragOver={(e) => {
        // Ignore in-app element drags (todo-row reorder) — let them pass through
        // to the row's own drop handler without the capture overlay (FIX6).
        if (!isFileDrag(e.dataTransfer)) return;
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragEnter={(e) => {
        if (!isFileDrag(e.dataTransfer)) return;
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragLeave={() => {
        // Clears the file-drag overlay; a no-op for element drags (never set it).
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e.dataTransfer)) return; // row drop → handled by the row
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const files = imageFilesFrom(e.dataTransfer);
        if (files.length) onFiles(files);
      }}
    >
      {children}
      <input
        ref={inputRef}
        data-testid="file-input"
        type="file"
        accept="image/*"
        multiple
        className={styles.fileInput}
        onChange={(e) => {
          const files = imagesFromList(e.target.files);
          if (files.length) onFiles(files);
          e.target.value = ""; // allow re-choosing the same file
        }}
      />
      <button
        type="button"
        className={styles.upload}
        aria-label="Upload image to capture"
        onClick={() => inputRef.current?.click()}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M5 20h14" />
        </svg>
      </button>
      {dragging ? (
        <div className={styles.overlay} aria-hidden="true">
          <span className={styles.hint}>Drop image to capture</span>
        </div>
      ) : null}
    </div>
  );
}
