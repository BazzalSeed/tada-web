"use client";

import { useRef, useState, type ReactNode } from "react";
import { imageFilesFrom } from "@/app/lib/capture-files";
import styles from "./Dropzone.module.css";

// Drag-and-drop capture surface. Wraps content; on image drop it emits the
// files. A soft overlay (rust dashed frame) appears while dragging — never a
// heavy fill. Paste is handled globally by CaptureZone, not here.
export interface DropzoneProps {
  onFiles: (files: File[]) => void;
  children: ReactNode;
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
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
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
