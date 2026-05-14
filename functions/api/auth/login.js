// functions/api/auth/login.js
import { json, err, createToken } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.PASSWORD) {
    return err("Server not configured: PASSWORD env var missing", 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON");
  }
  const { password } = body || {};
  if (typeof password !== "string") return err("Password required");

  // Constant-time compare
  const a = new TextEncoder().encode(password);
  const b = new TextEncoder().encode(env.PASSWORD);
  if (a.length !== b.length) {
    return err("Wrong password", 401);
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return err("Wrong password", 401);

  const token = await createToken(env.PASSWORD);
  return json({ token });
}
