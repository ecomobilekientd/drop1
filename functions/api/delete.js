// functions/api/delete.js
import { json, err, requireAuth, deleteHistoryByObjectKey } from "../_lib.js";

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
  const { key } = body || {};
  if (!key || typeof key !== "string") return err("Missing key");

  try {
    await env.BUCKET.delete(key);
    await deleteHistoryByObjectKey(env, key);
    return json({ ok: true });
  } catch (e) {
    return err("Delete failed: " + (e.message || "unknown"), 500);
  }
}
