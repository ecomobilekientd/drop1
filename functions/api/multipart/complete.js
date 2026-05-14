// functions/api/multipart/complete.js
import { json, err, requireAuth, publicUrl, saveHistory } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (!env.BUCKET) return err("R2 bucket not bound", 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON");
  }
  const { key, uploadId, parts, filename, size } = body || {};
  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return err("Missing key/uploadId/parts");
  }

  try {
    const multipart = env.BUCKET.resumeMultipartUpload(key, uploadId);
    // R2 expects parts in shape { partNumber, etag }
    const normalized = parts
      .map((p) => ({ partNumber: Number(p.partNumber), etag: p.etag }))
      .sort((a, b) => a.partNumber - b.partNumber);
    await multipart.complete(normalized);

    const link = publicUrl(env, key);
    const entry = {
      key,
      filename: filename || key,
      size: Number(size) || 0,
      url: link,
      uploadedAt: Date.now(),
    };
    await saveHistory(env, entry);
    return json(entry);
  } catch (e) {
    return err("Failed to complete: " + (e.message || "unknown"), 500);
  }
}
