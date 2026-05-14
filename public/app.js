// ============ State & Utils ============
const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "drop_token";

const fmtBytes = (b) => {
  if (b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const fmtTime = (ts) => {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return Math.floor(diff / 60_000) + "m ago";
  if (diff < 86_400_000) return Math.floor(diff / 3600_000) + "h ago";
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + "d ago";
  return d.toLocaleDateString();
};

const toast = (msg) => {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    return true;
  }
};

const headers = () => ({
  "X-Auth-Token": localStorage.getItem(TOKEN_KEY) || "",
});

// ============ Login ============
const loginForm = $("loginForm");
const loginGate = $("loginGate");
const appEl = $("app");
const loginError = $("loginError");

async function checkAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return false;
  try {
    const r = await fetch("/api/auth/check", { headers: headers() });
    return r.ok;
  } catch {
    return false;
  }
}

async function showApp() {
  loginGate.style.display = "none";
  appEl.hidden = false;
  loadHistory();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const pw = $("passwordInput").value;
  const btn = $("loginBtn");
  btn.disabled = true;
  btn.querySelector(".btn-label").textContent = "Checking…";
  try {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      loginError.textContent = e.error || "Wrong password";
      return;
    }
    const { token } = await r.json();
    localStorage.setItem(TOKEN_KEY, token);
    await showApp();
  } catch (err) {
    loginError.textContent = "Network error";
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-label").textContent = "Unlock";
  }
});

$("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

// ============ Dropzone ============
const dropzone = $("dropzone");
const fileInput = $("fileInput");
const browseBtn = $("browseBtn");
const dzContent = $("dzContent");
const dzProgress = $("dzProgress");
const dzSuccess = $("dzSuccess");

browseBtn.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", (e) => {
  // Only trigger on empty area, not on success/progress states
  if (e.target === dropzone || e.target.closest(".dz-content")) {
    if (!dzContent.hidden) fileInput.click();
  }
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

["dragenter", "dragover"].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "dragleave" && dropzone.contains(e.relatedTarget)) return;
    dropzone.classList.remove("dragover");
  });
});
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

function setState(state) {
  dzContent.hidden = state !== "idle";
  dzProgress.hidden = state !== "uploading";
  dzSuccess.hidden = state !== "success";
}

$("newUploadBtn").addEventListener("click", () => {
  fileInput.value = "";
  setState("idle");
});

// ============ Upload ============
const MULTIPART_THRESHOLD = 50 * 1024 * 1024; // 50MB
const PART_SIZE = 10 * 1024 * 1024; // 10MB per part

async function handleFile(file) {
  setState("uploading");
  $("progFileName").textContent = file.name;
  $("progFileMeta").textContent = `0 B / ${fmtBytes(file.size)}`;
  $("progBarFill").style.width = "0%";
  $("progStatus").textContent = "Preparing…";

  try {
    let result;
    if (file.size > MULTIPART_THRESHOLD) {
      result = await uploadMultipart(file);
    } else {
      result = await uploadSimple(file);
    }
    showSuccess(file, result);
    loadHistory();
    // Auto copy to clipboard
    await copyText(result.url);
    toast("Link copied to clipboard");
  } catch (err) {
    console.error(err);
    toast(err.message || "Upload failed");
    setState("idle");
  }
}

async function uploadSimple(file) {
  $("progStatus").textContent = "Uploading…";
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload?filename=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("X-Auth-Token", localStorage.getItem(TOKEN_KEY) || "");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 100;
        $("progBarFill").style.width = pct + "%";
        $("progFileMeta").textContent = `${fmtBytes(e.loaded)} / ${fmtBytes(e.total)}`;
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          reject(new Error(JSON.parse(xhr.responseText).error || "Upload failed"));
        } catch {
          reject(new Error("Upload failed"));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
}

async function uploadMultipart(file) {
  $("progStatus").textContent = "Initializing multipart…";
  // 1) Create multipart upload
  const initRes = await fetch(
    `/api/multipart/create?filename=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { ...headers(), "Content-Type": file.type || "application/octet-stream" },
    }
  );
  if (!initRes.ok) throw new Error("Failed to init multipart");
  const { uploadId, key } = await initRes.json();

  const totalParts = Math.ceil(file.size / PART_SIZE);
  const parts = [];
  let uploaded = 0;

  for (let i = 0; i < totalParts; i++) {
    const partNumber = i + 1;
    const start = i * PART_SIZE;
    const end = Math.min(start + PART_SIZE, file.size);
    const chunk = file.slice(start, end);

    $("progStatus").textContent = `Uploading part ${partNumber}/${totalParts}…`;

    const partRes = await uploadPart(key, uploadId, partNumber, chunk, (loaded) => {
      const totalLoaded = uploaded + loaded;
      const pct = (totalLoaded / file.size) * 100;
      $("progBarFill").style.width = pct + "%";
      $("progFileMeta").textContent = `${fmtBytes(totalLoaded)} / ${fmtBytes(file.size)}`;
    });
    parts.push({ partNumber, etag: partRes.etag });
    uploaded += chunk.size;
  }

  $("progStatus").textContent = "Finalizing…";
  // 3) Complete
  const completeRes = await fetch("/api/multipart/complete", {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ key, uploadId, parts, filename: file.name, size: file.size }),
  });
  if (!completeRes.ok) throw new Error("Failed to finalize");
  return completeRes.json();
}

function uploadPart(key, uploadId, partNumber, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `/api/multipart/upload-part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;
    xhr.open("PUT", url);
    xhr.setRequestHeader("X-Auth-Token", localStorage.getItem(TOKEN_KEY) || "");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Part ${partNumber} failed`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(blob);
  });
}

// ============ Success ============
function showSuccess(file, result) {
  setState("success");
  $("successFile").textContent = file.name;
  $("resultLink").value = result.url;
}

$("copyBtn").addEventListener("click", async () => {
  const btn = $("copyBtn");
  await copyText($("resultLink").value);
  btn.classList.add("copied");
  btn.querySelector("span").textContent = "Copied";
  setTimeout(() => {
    btn.classList.remove("copied");
    btn.querySelector("span").textContent = "Copy";
  }, 1500);
});

// ============ History ============
const historyList = $("historyList");
const historyEmpty = $("historyEmpty");
const refreshBtn = $("refreshBtn");

refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("spinning");
  loadHistory().finally(() => {
    setTimeout(() => refreshBtn.classList.remove("spinning"), 800);
  });
});

async function loadHistory() {
  try {
    const r = await fetch("/api/history", { headers: headers() });
    if (!r.ok) throw new Error("Failed");
    const items = await r.json();
    renderHistory(items);
  } catch (err) {
    console.error("History load error:", err);
  }
}

function renderHistory(items) {
  if (!items.length) {
    historyList.innerHTML = '<div class="history-empty"><p>No uploads yet</p></div>';
    return;
  }
  historyList.innerHTML = items
    .map(
      (item) => `
    <div class="history-item" data-key="${escapeHtml(item.key)}">
      <div class="hi-icon">
        ${getFileIcon(item.filename)}
      </div>
      <div class="hi-info">
        <div class="hi-name">${escapeHtml(item.filename)}</div>
        <div class="hi-meta">
          <span>${fmtBytes(item.size || 0)}</span>
          <span>·</span>
          <span>${fmtTime(item.uploadedAt)}</span>
        </div>
      </div>
      <div class="hi-actions">
        <button class="hi-btn copy" title="Copy link" data-url="${escapeHtml(item.url)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <a class="hi-btn" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" title="Open">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
        <button class="hi-btn delete" title="Delete" data-key="${escapeHtml(item.key)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>
  `
    )
    .join("");

  // Bind events
  historyList.querySelectorAll(".hi-btn.copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await copyText(btn.dataset.url);
      btn.classList.add("copied");
      toast("Link copied");
      setTimeout(() => btn.classList.remove("copied"), 1200);
    });
  });
  historyList.querySelectorAll(".hi-btn.delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this file? This cannot be undone.")) return;
      const key = btn.dataset.key;
      try {
        const r = await fetch("/api/delete", {
          method: "POST",
          headers: { ...headers(), "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        if (!r.ok) throw new Error("Delete failed");
        toast("Deleted");
        loadHistory();
      } catch (err) {
        toast("Delete failed");
      }
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFileIcon(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const images = ["jpg", "jpeg", "png", "gif", "webp", "svg", "heic"];
  const videos = ["mp4", "mov", "webm", "mkv", "avi"];
  const archives = ["zip", "rar", "7z", "tar", "gz"];
  const code = ["js", "ts", "jsx", "tsx", "html", "css", "json", "py", "go", "java", "swift", "kt"];

  if (images.includes(ext)) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  }
  if (videos.includes(ext)) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
  }
  if (archives.includes(ext)) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
  }
  if (code.includes(ext)) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
  }
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

// ============ Init ============
(async function init() {
  const ok = await checkAuth();
  if (ok) await showApp();
})();
