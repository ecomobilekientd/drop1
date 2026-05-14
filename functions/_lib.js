// functions/_lib.js
// Shared helpers for Pages Functions

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function err(message, status = 400) {
  return json({ error: message }, status);
}

// Simple session token: HMAC of timestamp using PASSWORD as secret
// Token format: base64(timestamp).base64(hex_hmac)
// Valid for 30 days
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function hmacSign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createToken(secret) {
  const ts = String(Date.now());
  const sig = await hmacSign(secret, ts);
  return btoa(ts) + "." + sig;
}

export async function verifyToken(token, secret) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const ts = atob(parts[0]);
    const tsNum = parseInt(ts, 10);
    if (!tsNum || Date.now() - tsNum > TOKEN_TTL_MS) return false;
    const expected = await hmacSign(secret, ts);
    // Constant-time-ish compare
    if (expected.length !== parts[1].length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export async function requireAuth(request, env) {
  if (!env.PASSWORD) {
    return { ok: false, response: err("Server not configured: PASSWORD missing", 500) };
  }
  const token = request.headers.get("X-Auth-Token");
  const ok = await verifyToken(token, env.PASSWORD);
  if (!ok) return { ok: false, response: err("Unauthorized", 401) };
  return { ok: true };
}

// Generate a safe object key for R2
export function makeKey(filename) {
  const ts = Date.now();
  const rand = crypto.randomUUID().split("-")[0];
  // Sanitize filename: strip path separators, control chars
  const safe = String(filename || "file")
    .replace(/[\/\\]/g, "_")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, 200);
  return `${ts}-${rand}-${safe}`;
}

// Build the public R2 URL.
// Priority: env.PUBLIC_BASE_URL (custom domain) > env.R2_PUBLIC_URL (r2.dev) > error
export function publicUrl(env, key) {
  const base = env.PUBLIC_BASE_URL || env.R2_PUBLIC_URL;
  if (!base) throw new Error("No public URL configured. Set R2_PUBLIC_URL env var.");
  const cleanBase = base.replace(/\/$/, "");
  return `${cleanBase}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
}

// Save metadata to KV
export async function saveHistory(env, entry) {
  if (!env.HISTORY) return; // KV not bound, skip silently
  const kvKey = `hist:${entry.uploadedAt}:${entry.key}`;
  await env.HISTORY.put(kvKey, JSON.stringify(entry), {
    // Keep for 1 year by default
    expirationTtl: 365 * 24 * 60 * 60,
  });
}

export async function deleteHistoryByObjectKey(env, objectKey) {
  if (!env.HISTORY) return;
  // KV doesn't support secondary index, so we list & filter
  const list = await env.HISTORY.list({ prefix: "hist:" });
  for (const k of list.keys) {
    if (k.name.endsWith(":" + objectKey)) {
      await env.HISTORY.delete(k.name);
    }
  }
}
