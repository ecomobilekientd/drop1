// functions/api/upload.js - Simple single-shot upload (for files < 50MB recommended)
import { json, err, requireAuth, makeKey, publicUrl, saveHistory } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  if (!env.BUCKET) return err("R2 bucket not bound", 500);

  const url = new URL(request.url);
  const filename = url.searchParams.get("filename") || "file";
  const contentType = request.headers.get("Content-Type") || "application/octet-stream";

  const key = makeKey(filename);

  try {
    const body = request.body;
    if (!body) return err("Empty body");

    // R2 put with streaming body. ContentLength helps avoid buffering.
    const contentLength = request.headers.get("Content-Length");
    const opts = {
      httpMetadata: { contentType },
    };
    if (contentLength) {
      // R2 .put supports passing ArrayBuffer/Stream/string/Blob
      await env.BUCKET.put(key, body, opts);
    } else {
      await env.BUCKET.put(key, body, opts);
    }

    const link = publicUrl(env, key);
    const entry = {
      key,
      filename,
      size: contentLength ? parseInt(contentLength, 10) : 0,
      contentType,
      url: link,
      uploadedAt: Date.now(),
    };
    await saveHistory(env, entry);

    return json(entry);
  } catch (e) {
    return err("Upload failed: " + (e.message || "unknown"), 500);
  }
}
