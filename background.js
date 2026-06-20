try { if (typeof globalThis.g === "undefined") globalThis.g = globalThis; } catch {}
var g = globalThis;
const LOCAL_SERVER_BASE = "https://one-click-dub-fast-server.onrender.com";


const CUSTOM_DUB_SERVER_BASE = "https://YOUR-RUNPOD-POD-ID-8000.proxy.runpod.net";

// Serverless direct mode is for PRIVATE testing only.
// Do not publish a Chrome extension with a RunPod API key inside it.
// Production should use your own lightweight API gateway that keeps RUNPOD_API_KEY secret.
const OCD_BACKEND_MODE = "runpod-serverless"
const RUNPOD_SERVERLESS_ENDPOINT_ID = "jtk3716mehm2h7";
const RUNPOD_API_KEY = "rpa_ZCEDLJNR3I075P9TF21OJF81JSZN3C986MQ7TZ4F2m92d4";

// Each One Click Dub model can route to its own RunPod Serverless Endpoint.
// Keep the current endpoint as the default Quality/OmniVoice endpoint, then replace
// PUT_FAST_ENDPOINT_ID_HERE and PUT_PRO_ENDPOINT_ID_HERE with your real Endpoint IDs.
const DEFAULT_RUNPOD_MODEL = "quality";
const RUNPOD_SERVERLESS_ENDPOINTS = {
  fast: {
    label: "Fast",
    endpointId: "PUT_FAST_ENDPOINT_ID_HERE",
    apiKey: RUNPOD_API_KEY,
    policy: { executionTimeout: 600000, ttl: 3600000 }
  },
  quality: {
    label: "Quality / OmniVoice",
    endpointId: RUNPOD_SERVERLESS_ENDPOINT_ID,
    apiKey: RUNPOD_API_KEY,
    policy: { executionTimeout: 900000, ttl: 3600000 }
  },
  pro: {
    label: "Pro",
    endpointId: "PUT_PRO_ENDPOINT_ID_HERE",
    apiKey: RUNPOD_API_KEY,
    policy: { executionTimeout: 1200000, ttl: 3600000 }
  }
};
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
    // path arrives like: /api/custom/jobs/rp%3A<runpod_job_id>
    // Decode it before stripping the local "rp:" prefix; otherwise RunPod receives
    // "rp%3A..." as the job id and /status returns HTTP 404.
    const rawId = String(path || "").split("/").pop();
    let id = rawId;
    try { id = decodeURIComponent(rawId); } catch {}
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

function assertRunpodServerlessConfig(config, modelKey) {
  if (!config?.endpointId || config.endpointId.includes("PUT_") || config.endpointId.includes("YOUR_")) {
    throw new Error(`Set RunPod Serverless Endpoint ID for model ${modelKey || DEFAULT_RUNPOD_MODEL} in background.js`);
  }
  if (!config?.apiKey || config.apiKey.includes("PUT_RUNPOD")) {
    throw new Error("Set RUNPOD_API_KEY in background.js for private testing, or use an API gateway for production");
  }
}


function normalizeOcdModelKey(payload) {
  const raw = String(
    payload?.model ||
    payload?.mode ||
    payload?.tier ||
    payload?.quality ||
    payload?.selectedModel ||
    payload?.modelName ||
    DEFAULT_RUNPOD_MODEL
  ).toLowerCase().trim();

  if (raw.includes("fast") || raw.includes("edge")) return "fast";
  if (raw.includes("pro")) return "pro";
  if (raw.includes("quality") || raw.includes("omni") || raw.includes("omnivoice")) return "quality";
  return DEFAULT_RUNPOD_MODEL;
}

function getRunpodEndpointConfig(modelKey) {
  const key = RUNPOD_SERVERLESS_ENDPOINTS[modelKey] ? modelKey : DEFAULT_RUNPOD_MODEL;
  const config = RUNPOD_SERVERLESS_ENDPOINTS[key];
  assertRunpodServerlessConfig(config, key);
  return { key, config };
}

async function saveRunpodJobRoute(jobId, modelKey, endpointId) {
  try {
    if (!chrome.storage?.local?.set) return;
    const cleanId = normalizeRunpodJobId(jobId);
    await chrome.storage.local.set({
      [`ocdRunpodJobRoute:${cleanId}`]: {
        modelKey,
        endpointId,
        createdAt: Date.now()
      }
    });
  } catch (error) {
    console.warn("Could not save RunPod job route", error?.message || error);
  }
}

async function getRunpodJobRoute(jobId) {
  try {
    if (!chrome.storage?.local?.get) return null;
    const cleanId = normalizeRunpodJobId(jobId);
    const key = `ocdRunpodJobRoute:${cleanId}`;
    const saved = await chrome.storage.local.get(key);
    return saved?.[key] || null;
  } catch (error) {
    console.warn("Could not read RunPod job route", error?.message || error);
    return null;
  }
}

function findRunpodModelByEndpointId(endpointId) {
  for (const [key, config] of Object.entries(RUNPOD_SERVERLESS_ENDPOINTS)) {
    if (config?.endpointId && config.endpointId === endpointId) return key;
  }
  return DEFAULT_RUNPOD_MODEL;
}

function normalizeOcdVoiceNameForModel(payload, modelKey) {
  const raw = String(
    payload?.voiceName ||
    payload?.voice ||
    payload?.selectedVoice ||
    payload?.voiceRole ||
    ""
  ).trim();

  if (modelKey === "fast") {
    // Fast uses Microsoft Edge voice names such as ar-SA-HamedNeural.
    return raw || "ar-SA-HamedNeural";
  }

  // Quality/Pro use either auto clone or one of the four ready sample voice keys.
  const value = (raw || "auto-clone-video").toLowerCase();
  const allowed = new Set([
    "auto-clone-video",
    "ocd-orion-male",
    "ocd-salem-male",
    "ocd-lina-female",
    "ocd-noura-female"
  ]);
  return allowed.has(value) ? value : "auto-clone-video";
}

async function startRunpodServerlessJob(payload) {
  const modelKey = normalizeOcdModelKey(payload || {});
  const { key, config } = getRunpodEndpointConfig(modelKey);
  const normalizedVoiceName = normalizeOcdVoiceNameForModel(payload || {}, key);

  // Serverless handler returns base64 MP3. Browser cookies are stripped server-side unless explicitly enabled.
  const res = await fetch(`https://api.runpod.ai/v2/${config.endpointId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      input: {
        ...(payload || {}),
        model: key,
        modelName: key,
        ocdModel: key,
        voiceName: normalizedVoiceName
      },
      policy: config.policy || { executionTimeout: 900000, ttl: 3600000 }
    })
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || data?.message || `RunPod /run failed for ${key}: HTTP ${res.status}`);
  const runpodJobId = data.id || data.jobId;
  if (!runpodJobId) throw new Error(`RunPod did not return a job id for ${key}`);

  await saveRunpodJobRoute(runpodJobId, key, config.endpointId);
  console.log(`[OCD] RunPod Serverless ${key} job started:`, runpodJobId, "endpoint:", config.endpointId);
  return { ok: true, jobId: runpodJobId, model: key, endpointId: config.endpointId, service: "runpod-serverless" };
}

function normalizeRunpodJobId(jobId) {
  let cleanId = String(jobId || "").trim();

  // Handle raw and URL-encoded local prefixes.
  try { cleanId = decodeURIComponent(cleanId); } catch {}
  cleanId = cleanId.replace(/^rp:/, "");
  cleanId = cleanId.replace(/^rp%3A/i, "");

  // Defensive cleanup in case a full local path or accidental URL is passed.
  cleanId = cleanId.split("/").pop() || cleanId;
  try { cleanId = decodeURIComponent(cleanId); } catch {}
  cleanId = cleanId.replace(/^rp:/, "").replace(/^rp%3A/i, "").trim();

  return cleanId;
}

async function getRunpodServerlessStatus(jobId) {
  const cleanId = normalizeRunpodJobId(jobId);
  if (!cleanId) {
    throw new Error("RunPod /status failed: empty job id");
  }

  const route = await getRunpodJobRoute(cleanId);
  const modelKey = route?.modelKey || findRunpodModelByEndpointId(route?.endpointId) || DEFAULT_RUNPOD_MODEL;
  const { key, config } = getRunpodEndpointConfig(modelKey);
  const endpointId = route?.endpointId || config.endpointId;
  assertRunpodServerlessConfig({ ...config, endpointId }, key);

  const statusUrl = `https://api.runpod.ai/v2/${endpointId}/status/${encodeURIComponent(cleanId)}`;
  const res = await fetch(statusUrl, {
    headers: { "Authorization": `Bearer ${config.apiKey}` }
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const details = data?.error || data?.message || data?.raw || "";
    if (res.status === 404) {
      throw new Error(`RunPod /status failed: HTTP 404 for job ${cleanId} on ${key} endpoint ${endpointId}. Check that /run and /status use the same Endpoint ID, and that the job TTL has not expired.`);
    }
    throw new Error(`RunPod /status failed: HTTP ${res.status} for ${key} job ${cleanId}${details ? " · " + details : ""}`);
  }

  const st = String(data.status || "").toUpperCase();
  if (st === "COMPLETED") {
    const out = data.output || {};
    if (out.ok === false) {
      return { ok: false, status: "error", progress: 100, error: out.error || "RunPod worker failed", message: out.error || "RunPod worker failed", model: key };
    }
    if (!out.audioBase64) {
      return { ok: false, status: "error", progress: 100, error: "Worker completed but did not return audioBase64", message: "Missing audioBase64", model: key };
    }
    return {
      ok: true,
      status: "done",
      progress: 100,
      message: `Done · ${out.audioBytes || 0} bytes · ${out.elapsedSec || "?"} sec`,
      outputKind: "audio",
      audioUrl: `data:${out.audioMime || "audio/mpeg"};base64,${out.audioBase64}`,
      model: key,
      endpointId,
      runpod: { id: cleanId, endpointId, model: key, delayTime: data.delayTime, executionTime: data.executionTime },
      meta: out.meta || {}
    };
  }
  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(st)) {
    return { ok: false, status: "error", progress: 100, error: data.error || data.message || `RunPod job ${st}`, message: data.error || data.message || `RunPod job ${st}`, model: key, endpointId };
  }
  const progress = st === "IN_QUEUE" ? 3 : 35;
  return { ok: true, status: st === "IN_QUEUE" ? "queued" : "processing", progress, message: `RunPod Serverless ${key}: ${st || "processing"}`, model: key, endpointId };
}

