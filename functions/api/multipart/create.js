// functions/api/multipart/create.js
import { json, err, requireAuth, makeKey } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (!env.BUCKET) return err("R2 bucket not bound", 500);

  const url = new URL(request.url);
  const filename = url.searchParams.get("filename") || "file";
  const contentType = request.headers.get("Content-Type") || "application/octet-stream";

  const key = makeKey(filename);
  try {
    const multipart = await env.BUCKET.createMultipartUpload(key, {
      httpMetadata: { contentType },
    });
    return json({ key, uploadId: multipart.uploadId });
  } catch (e) {
    return err("Failed to create multipart: " + (e.message || "unknown"), 500);
  }
}
