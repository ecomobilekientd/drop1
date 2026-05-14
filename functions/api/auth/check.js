// functions/api/auth/check.js
import { json, requireAuth } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;
  return json({ ok: true });
}
