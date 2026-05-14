// functions/api/multipart/upload-part.js
import { json, err, requireAuth } from "../../_lib.js";

export async function onRequestPut({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (!env.BUCKET) return err("R2 bucket not bound", 500);

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const partNumber = parseInt(url.searchParams.get("partNumber") || "0", 10);

  if (!key || !uploadId || !partNumber) {
    return err("Missing key/uploadId/partNumber");
  }

  try {
    const multipart = env.BUCKET.resumeMultipartUpload(key, uploadId);
    const body = request.body;
    if (!body) return err("Empty part body");
    const part = await multipart.uploadPart(partNumber, body);
    return json({ partNumber: part.partNumber, etag: part.etag });
  } catch (e) {
    return err("Part upload failed: " + (e.message || "unknown"), 500);
  }
}
