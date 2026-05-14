// functions/api/history.js
import { json, err, requireAuth } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (!env.HISTORY) return json([]);

  try {
    // Keys are prefixed `hist:<timestamp>:<r2key>`
    // KV list returns keys in lexicographic order. Since timestamp is fixed-width-ish
    // we'll reverse manually after fetching.
    const list = await env.HISTORY.list({ prefix: "hist:", limit: 1000 });
    const items = await Promise.all(
      list.keys.map(async (k) => {
        const v = await env.HISTORY.get(k.name);
        if (!v) return null;
        try {
          return JSON.parse(v);
        } catch {
          return null;
        }
      })
    );
    const valid = items.filter(Boolean).sort((a, b) => b.uploadedAt - a.uploadedAt);
    return json(valid);
  } catch (e) {
    return err("Failed to load history: " + (e.message || "unknown"), 500);
  }
}
