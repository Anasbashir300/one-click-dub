try { if (typeof globalThis.g === "undefined") globalThis.g = globalThis; } catch {}
var g = globalThis;
const LOCAL_SERVER_BASE = "https://one-click-dub-fast-server.onrender.com";


const CUSTOM_DUB_SERVER_BASE = "https://YOUR-RUNPOD-POD-ID-8000.proxy.runpod.net";

// Serverless direct mode is for PRIVATE testing only.
// Do not publish a Chrome extension with a RunPod API key inside it.
// Production should use your own lightweight API gateway that keeps RUNPOD_API_KEY secret.
const OCD_BACKEND_MODE = "fastapi"; // "fastapi" or "runpod-serverless"
const RUNPOD_SERVERLESS_ENDPOINT_ID = "PUT_ENDPOINT_ID_HERE";
const RUNPOD_API_KEY = "PUT_RUNPOD_API_KEY_HERE";
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message?.type === "OCD_GET_YOUTUBE_COOKIES") {
    getYoutubeCookieString()
      .then(cookieString => sendResponse({ ok: true, cookieString }))
      .catch(error => {
        console.warn("Could not read YouTube cookies", error);
        sendResponse({ ok: false, error: error?.message || String(error), cookieString: "" });
      });
    return true;
  }

  if (message?.type === "OCD_GET_SITE_COOKIES") {
    getCookieStringForUrl(message.url || sender?.tab?.url || "")
      .then(cookieString => sendResponse({ ok: true, cookieString }))
      .catch(error => {
        console.warn("Could not read site cookies", error);
        sendResponse({ ok: false, error: error?.message || String(error), cookieString: "" });
      });
    return true;
  }
  if (message?.type === "OCD_FAST_FREE_PREPARE_BATCH") {
    postLocal("/api/fast/prepare-batch", message.payload || {})
      .then(sendResponse)
      .catch(error => {
        console.error("Local fast batch failed", error);
        sendResponse({ ok: false, error: error?.message || String(error), source: "local-server" });
      });
    return true;
  }

  if (message?.type === "OCD_FAST_EDGE_DUB") {
    postLocal("/api/fast/sample", message.payload || {})
      .then(sendResponse)
      .catch(error => {
        console.error("Local sample dub failed", error);
        sendResponse({ ok: false, error: error?.message || String(error), source: "local-server" });
      });
    return true;
  }

  if (message?.type === "OCD_PVT_START_JOB") {
    postPvt("/api/custom/dub", message.payload || {})
      .then(sendResponse)
      .catch(error => {
        console.error("Custom RunPod dubbing start failed", error);
        sendResponse({ ok: false, error: error?.message || String(error), source: "custom-runpod" });
      });
    return true;
  }

  if (message?.type === "OCD_PVT_JOB_STATUS") {
    getPvt(`/api/custom/jobs/${encodeURIComponent(message.jobId || "")}`)
      .then(sendResponse)
      .catch(error => {
        console.error("Custom RunPod dubbing status failed", error);
        sendResponse({ ok: false, error: error?.message || String(error), source: "custom-runpod" });
      });
    return true;
  }
});

async function postLocal(path, payload) {
  const res = await fetch(LOCAL_SERVER_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Local server failed: HTTP ${res.status}`);
  }
  return data;
}


async function getYoutubeCookieString() {
  if (!chrome.cookies?.getAll) return "";
  const domains = [".youtube.com", "youtube.com", "www.youtube.com", ".google.com", "google.com"];
  const map = new Map();
  for (const domain of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      for (const c of cookies || []) {
        if (!c?.name || typeof c.value !== "string") continue;
        // Prefer the most specific/recent cookie value when duplicates exist.
        map.set(c.name, c.value);
      }
    } catch (error) {
      console.warn("cookie read failed for", domain, error?.message || error);
    }
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function getCookieStringForUrl(rawUrl) {
  if (!chrome.cookies?.getAll || !rawUrl) return "";
  let url;
  try { url = new URL(rawUrl); } catch { return ""; }
  if (!/^https?:$/.test(url.protocol)) return "";

  const urls = new Set([url.origin + "/", url.href]);
  const map = new Map();
  for (const u of urls) {
    try {
      const cookies = await chrome.cookies.getAll({ url: u });
      for (const c of cookies || []) {
        if (!c?.name || typeof c.value !== "string") continue;
        map.set(c.name, c.value);
      }
    } catch (error) {
      console.warn("site cookie read failed for", u, error?.message || error);
    }
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}


async function getCustomDubServerBase() {
  try {
    const saved = await chrome.storage.sync.get({ customDubServerBase: CUSTOM_DUB_SERVER_BASE });
    return String(saved.customDubServerBase || CUSTOM_DUB_SERVER_BASE).replace(/\/$/, "");
  } catch {
    return CUSTOM_DUB_SERVER_BASE.replace(/\/$/, "");
  }
}

async function postPvt(path, payload) {
  if (OCD_BACKEND_MODE === "runpod-serverless") {
    return startRunpodServerlessJob(payload || {});
  }
  const base = await getCustomDubServerBase();
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Custom dubbing server failed: HTTP ${res.status}`);
  }
  return data;
}

async function getPvt(path) {
  if (OCD_BACKEND_MODE === "runpod-serverless") {
    const id = String(path || "").split("/").pop();
    return getRunpodServerlessStatus(id);
  }
  const base = await getCustomDubServerBase();
  const res = await fetch(base + path);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Custom dubbing server failed: HTTP ${res.status}`);
  }
  return data;
}

function assertRunpodServerlessConfig() {
  if (!RUNPOD_SERVERLESS_ENDPOINT_ID || RUNPOD_SERVERLESS_ENDPOINT_ID.includes("PUT_ENDPOINT")) {
    throw new Error("Set RUNPOD_SERVERLESS_ENDPOINT_ID in background.js");
  }
  if (!RUNPOD_API_KEY || RUNPOD_API_KEY.includes("PUT_RUNPOD")) {
    throw new Error("Set RUNPOD_API_KEY in background.js for private testing, or use an API gateway for production");
  }
}

async function startRunpodServerlessJob(payload) {
  assertRunpodServerlessConfig();
  // Serverless handler returns base64 MP3. Browser cookies are stripped server-side unless explicitly enabled.
  const res = await fetch(`https://api.runpod.ai/v2/${RUNPOD_SERVERLESS_ENDPOINT_ID}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RUNPOD_API_KEY}`
    },
    body: JSON.stringify({ input: payload })
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || data?.message || `RunPod /run failed: HTTP ${res.status}`);
  const runpodJobId = data.id || data.jobId;
  if (!runpodJobId) throw new Error("RunPod did not return a job id");
  return { ok: true, jobId: `rp:${runpodJobId}`, service: "runpod-serverless" };
}

async function getRunpodServerlessStatus(jobId) {
  assertRunpodServerlessConfig();
  const cleanId = String(jobId || "").replace(/^rp:/, "");
  const res = await fetch(`https://api.runpod.ai/v2/${RUNPOD_SERVERLESS_ENDPOINT_ID}/status/${encodeURIComponent(cleanId)}`, {
    headers: { "Authorization": `Bearer ${RUNPOD_API_KEY}` }
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || data?.message || `RunPod /status failed: HTTP ${res.status}`);

  const st = String(data.status || "").toUpperCase();
  if (st === "COMPLETED") {
    const out = data.output || {};
    if (out.ok === false) {
      return { ok: false, status: "error", progress: 100, error: out.error || "RunPod worker failed", message: out.error || "RunPod worker failed" };
    }
    if (!out.audioBase64) {
      return { ok: false, status: "error", progress: 100, error: "Worker completed but did not return audioBase64", message: "Missing audioBase64" };
    }
    return {
      ok: true,
      status: "done",
      progress: 100,
      message: `Done · ${out.audioBytes || 0} bytes · ${out.elapsedSec || "?"} sec`,
      outputKind: "audio",
      audioUrl: `data:${out.audioMime || "audio/mpeg"};base64,${out.audioBase64}`,
      runpod: { id: cleanId, delayTime: data.delayTime, executionTime: data.executionTime },
      meta: out.meta || {}
    };
  }
  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(st)) {
    return { ok: false, status: "error", progress: 100, error: data.error || data.message || `RunPod job ${st}`, message: data.error || data.message || `RunPod job ${st}` };
  }
  const progress = st === "IN_QUEUE" ? 3 : 35;
  return { ok: true, status: st === "IN_QUEUE" ? "queued" : "processing", progress, message: `RunPod Serverless: ${st || "processing"}` };
}
