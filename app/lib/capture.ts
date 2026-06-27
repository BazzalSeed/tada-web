import { upload } from "@vercel/blob/client";
import type { Capture, Todo } from "@/lib/contracts";

// Client capture seam. Both paths hit POST /api/capture (capture-first on the
// server: a plain Todo is persisted before extraction, so todos[0] is always a
// usable todo even if extraction fails). Small images go inline as base64;
// larger ones go direct-to-Blob first, then capture by blobPath.
export interface CaptureResult {
  capture: Capture;
  todos: Todo[];
}

const INLINE_MAX = 4 * 1024 * 1024; // 4MB — above this, upload to Blob first

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1)); // strip the data: prefix
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function postCapture(body: unknown): Promise<CaptureResult> {
  const res = await fetch("/api/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`capture failed: ${res.status}`);
  return res.json() as Promise<CaptureResult>;
}

export async function captureImageFile(file: File): Promise<CaptureResult> {
  if (file.size <= INLINE_MAX) {
    return postCapture({
      kind: "image",
      image: { base64: await fileToBase64(file), mimeType: file.type },
    });
  }
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    contentType: file.type,
  });
  return postCapture({ kind: "image", blobPath: blob.url });
}

export async function captureText(text: string): Promise<CaptureResult> {
  return postCapture({ kind: "text", text });
}
