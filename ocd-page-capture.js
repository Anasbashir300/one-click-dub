(() => {
  if (window.__ocdPageCaptionCaptureInstalled) return;
  window.__ocdPageCaptionCaptureInstalled = true;

  const MAX_BODY = 2_000_000;
  const seen = new Set();

  function looksLikeCaptionUrl(url) {
    const s = String(url || "");
    return s.includes("/api/timedtext") || s.includes("timedtext") || s.includes("caption") || s.includes("get_transcript");
  }

  function looksLikeCaptionBody(text) {
    const s = String(text || "").trim();
    if (!s) return false;
    if (s.includes('"events"') && s.includes('"segs"')) return true;
    if (s.includes("<text") || s.includes("<p ")) return true;
    if (s.includes("transcriptSegmentRenderer")) return true;
    return false;
  }

  function postCaptionBody(url, body) {
    try {
      const text = String(body || "");
      if (!text || text.length > MAX_BODY || !looksLikeCaptionBody(text)) return;
      const key = String(url || "") + "|" + text.length + "|" + text.slice(0, 80);
      if (seen.has(key)) return;
      seen.add(key);
      window.postMessage({
        source: "OCD_PAGE_CAPTION_CAPTURE",
        type: "caption-body",
        url: String(url || ""),
        body: text
      }, "*");
    } catch {}
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function patchedFetch(input, init) {
      const response = await originalFetch.apply(this, arguments);
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (looksLikeCaptionUrl(url)) {
          response.clone().text().then(text => postCaptionBody(url, text)).catch(() => {});
        }
      } catch {}
      return response;
    };
  }

  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;
    XHR.prototype.open = function patchedOpen(method, url) {
      try { this.__ocdCaptionUrl = String(url || ""); } catch {}
      return open.apply(this, arguments);
    };
    XHR.prototype.send = function patchedSend() {
      try {
        this.addEventListener("loadend", () => {
          try {
            const url = this.__ocdCaptionUrl || "";
            if (!looksLikeCaptionUrl(url)) return;
            if (typeof this.responseText === "string") postCaptionBody(url, this.responseText);
          } catch {}
        });
      } catch {}
      return send.apply(this, arguments);
    };
  }

  console.info("[OCD page] caption network capture installed");
})();
