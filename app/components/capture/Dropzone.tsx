"use client";

import { useRef, useState, type ReactNode } from "react";
import { imageFilesFrom } from "@/app/lib/capture-files";
import styles from "./Dropzone.module.css";

// Drag-and-drop capture surface. Wraps content; on image drop it emits the
// files. A soft overlay (rust dashed frame) appears while dragging — never a
// heavy fill. Paste is handled globally by CaptureZone; click-to-upload lives
// in the add bar (AddCardView).
export interface DropzoneProps {
  onFiles: (files: File[]) => void;
  children: ReactNode;
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
      {dragging ? (
        <div className={styles.overlay} aria-hidden="true">
          <span className={styles.hint}>Drop image to capture</span>
        </div>
      ) : null}
    </div>
  );
}
