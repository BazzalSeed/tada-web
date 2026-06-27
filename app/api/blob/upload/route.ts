// POST /api/blob/upload — signed, direct-to-Vercel-Blob client upload handshake
// for capture images. The browser uses `upload(file, { handleUploadUrl })` from
// @vercel/blob/client; this route authorizes (currentUser), constrains to images,
// and mints the scoped client token. The client then POSTs /api/capture with the
// resulting blob URL as `blobPath`.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/http";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson<HandleUploadBody>(req);
    const result = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => {
        // Authorize the uploader; attribute the blob to its owner.
        const user = await currentUser();
        return {
          allowedContentTypes: IMAGE_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.userId }),
        };
      },
      // Capture.blobPath is set when the client calls /api/capture with the URL,
      // so no server-side persistence is needed in this completion hook.
      onUploadCompleted: async () => {},
    });
    return json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
