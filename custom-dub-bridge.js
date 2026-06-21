// One Click Dub custom backend bridge content script.
// Uses RunPod custom backend and plays returned audio in sync with the current page video on YouTube and other public sites.
(() => {
  if (window.__OCD_PVT_BRIDGE__) return;
  window.__OCD_PVT_BRIDGE__ = true;

  let box = null;
  let polling = false;
  let overlay = null;
  let floatingDock = null;
  let dockExpanded = true;
  let captionVisible = false;
  let captionBox = null;
  let captionTimer = null;
  let lastDubResult = null;

  function getVideo() {
    const videos = [...document.querySelectorAll('video')].filter(v => {
      const r = v.getBoundingClientRect();
      return r.width > 80 && r.height > 45 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    });
    return videos.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    })[0] || document.querySelector('video');
  }

  function getBestVideoUrl(video) {
    const pageUrl = location.href;
    const host = location.hostname.toLowerCase();
    // For YouTube/Vimeo and many players, yt-dlp works better with the watch/page URL than media blobs.
    if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('vimeo.com')) return pageUrl;

    const candidates = [];
    try { if (video?.currentSrc) candidates.push(video.currentSrc); } catch {}
    try { if (video?.src) candidates.push(video.src); } catch {}
    try {
      for (const s of video?.querySelectorAll?.('source[src]') || []) candidates.push(s.src || s.getAttribute('src'));
    } catch {}

    for (const c of candidates) {
      const u = safeAbsoluteUrl(c);
      if (u && /^https:\/\//i.test(u) && !/^blob:/i.test(u) && !/^data:/i.test(u)) return u;
    }
    return pageUrl;
  }

  function safeAbsoluteUrl(value) {
    if (!value) return '';
    try { return new URL(value, location.href).href; } catch { return ''; }
  }

  function isSupportedPageUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:';
    } catch { return false; }
  }

  function ensureUi() {
    if (document.getElementById('ocd-pvt-dock')) {
      updateFloatingDock();
      return;
    }

    injectFloatingDockCss();

    floatingDock = document.createElement('div');
    floatingDock.id = 'ocd-pvt-dock';
    floatingDock.innerHTML = `
      <button id="ocd-pvt-btn" class="ocd-pvt-main" type="button" title="Start One Click Dub">
        <span class="ocd-pvt-dot"></span>
        <span class="ocd-pvt-label">DUB</span>
      </button>
      <div id="ocd-pvt-actions" class="ocd-pvt-actions" aria-hidden="false">
        <button id="ocd-pvt-caption-btn" class="ocd-pvt-action" type="button" title="Show / hide captions">
          <span>CC</span>
          <small>Caption</small>
        </button>
        <button id="ocd-pvt-download-btn" class="ocd-pvt-action disabled" type="button" title="Download dubbed audio after it is ready">
          <span>⬇</span>
          <small>Download</small>
        </button>
      </div>
    `;
    document.documentElement.appendChild(floatingDock);

    floatingDock.querySelector('#ocd-pvt-btn')?.addEventListener('click', async () => {
      // Keep Caption and Download buttons visible; DUB remains the primary start/stop control.
      dockExpanded = true;
      updateFloatingDock();

      if (overlay) {
        stopOverlayAudio(true);
        return;
      }

      if (!polling) {
        try {
          show('Starting One Click Dub...', 1);
          await startJob();
        } catch (error) {
          console.error('[OCD] DUB button failed:', error);
          show('DUB failed: ' + (error?.message || String(error)), 100);
        }
      }
    });

    floatingDock.querySelector('#ocd-pvt-caption-btn')?.addEventListener('click', () => {
      toggleCustomCaptions();
    });

    floatingDock.querySelector('#ocd-pvt-download-btn')?.addEventListener('click', () => {
      downloadLastDubAudio();
    });

    updateFloatingDock();
  }

  function injectFloatingDockCss() {
    if (document.getElementById('ocd-pvt-dock-css')) return;
    const style = document.createElement('style');
    style.id = 'ocd-pvt-dock-css';
    style.textContent = `
      #ocd-pvt-dock, #ocd-pvt-dock * { box-sizing: border-box; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
      #ocd-pvt-dock {
        position: fixed;
        right: 18px;
        top: 46%;
        transform: translateY(-50%);
        z-index: 2147483647;
        display: grid;
        gap: 10px;
        justify-items: end;
        direction: ltr;
        pointer-events: auto;
        overflow: visible !important;
      }
      #ocd-pvt-dock button { cursor: pointer; user-select: none; }
      #ocd-pvt-dock .ocd-pvt-main {
        min-width: 68px;
        height: 46px;
        border: 1px solid rgba(34, 211, 238, .48);
        border-radius: 17px;
        color: #ecfeff;
        background: linear-gradient(135deg, rgba(8, 14, 30, .96), rgba(22, 18, 48, .96));
        box-shadow: 0 16px 45px rgba(0,0,0,.42), 0 0 28px rgba(34,211,238,.16);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 13px;
        font-weight: 950;
        letter-spacing: .08em;
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
        backdrop-filter: blur(12px);
      }
      #ocd-pvt-dock .ocd-pvt-main:hover { transform: translateX(-2px) scale(1.03); box-shadow: 0 20px 55px rgba(0,0,0,.52), 0 0 34px rgba(34,211,238,.26); }
      #ocd-pvt-dock .ocd-pvt-dot { width: 8px; height: 8px; border-radius: 999px; background: #22d3ee; box-shadow: 0 0 14px rgba(34,211,238,.85); }
      #ocd-pvt-dock .ocd-pvt-actions {
        display: grid !important;
        gap: 9px;
        opacity: 1 !important;
        pointer-events: auto !important;
        transform: translateX(0) scale(1) !important;
        transition: opacity .18s ease, transform .18s ease;
        overflow: visible !important;
      }
      #ocd-pvt-dock.open .ocd-pvt-actions { opacity: 1; pointer-events: auto; transform: translateX(0) scale(1); }
      #ocd-pvt-dock .ocd-pvt-action {
        width: 78px;
        min-height: 52px;
        border: 1px solid rgba(255,255,255,.13);
        border-radius: 16px;
        color: #ffffff;
        background: linear-gradient(180deg, rgba(18, 24, 42, .94), rgba(9, 11, 22, .94));
        box-shadow: 0 14px 36px rgba(0,0,0,.38);
        display: grid;
        place-items: center;
        gap: 2px;
        padding: 7px 8px;
        font-weight: 900;
        transition: transform .18s ease, opacity .18s ease, border-color .18s ease, background .18s ease;
        backdrop-filter: blur(12px);
      }
      #ocd-pvt-dock .ocd-pvt-action span { font-size: 16px; line-height: 1; }
      #ocd-pvt-dock .ocd-pvt-action small { font-size: 10px; font-weight: 900; letter-spacing: .02em; opacity: .86; }
      #ocd-pvt-dock .ocd-pvt-action:hover { transform: translateX(-2px) scale(1.035); border-color: rgba(34,211,238,.55); }
      #ocd-pvt-dock .ocd-pvt-action.active { border-color: rgba(34,211,238,.75); background: linear-gradient(135deg, rgba(8, 145, 178, .95), rgba(37, 99, 235, .95)); }
      #ocd-pvt-dock .ocd-pvt-action.ready { border-color: rgba(52, 211, 153, .82); background: linear-gradient(135deg, #059669, #34d399); color: #062216; box-shadow: 0 18px 45px rgba(16,185,129,.32); }
      #ocd-pvt-dock .ocd-pvt-action.disabled { opacity: .45; filter: grayscale(.25); cursor: not-allowed; }
      #ocd-pvt-dock.busy .ocd-pvt-main { border-color: rgba(168,85,247,.65); background: linear-gradient(135deg, rgba(88,28,135,.98), rgba(30,64,175,.98)); }
      #ocd-pvt-dock.busy .ocd-pvt-dot { background: #a78bfa; box-shadow: 0 0 16px rgba(167,139,250,.95); animation: ocdPvtPulse 1s ease-in-out infinite; }
      #ocd-pvt-dock.ready .ocd-pvt-main { border-color: rgba(52,211,153,.72); background: linear-gradient(135deg, rgba(6,95,70,.98), rgba(8,47,73,.98)); }
      #ocd-pvt-dock.ready .ocd-pvt-dot { background: #34d399; box-shadow: 0 0 16px rgba(52,211,153,.95); }
      #ocd-pvt-caption-box {
        position: fixed;
        left: 50%;
        bottom: 13%;
        transform: translateX(-50%);
        z-index: 2147483646;
        max-width: min(840px, 88vw);
        padding: 12px 18px;
        border-radius: 16px;
        color: #fff;
        background: rgba(0,0,0,.58);
        border: 1px solid rgba(255,255,255,.16);
        box-shadow: 0 18px 55px rgba(0,0,0,.45);
        text-align: center;
        font-size: clamp(18px, 2.2vw, 28px);
        line-height: 1.35;
        font-weight: 850;
        text-shadow: 0 3px 10px rgba(0,0,0,.82);
        backdrop-filter: blur(8px);
        pointer-events: none;
      }
      #ocd-pvt-caption-box.hidden { display: none !important; }
      @keyframes ocdPvtPulse { 0%,100%{ transform: scale(1); opacity: 1 } 50%{ transform: scale(1.45); opacity: .55 } }
    `;
    document.documentElement.appendChild(style);
  }
  function show(message, progress = 0, actionsHtml = '') {
    updateFloatingDock();
    if (!box) {
      box = document.createElement('div');
      box.id = 'ocd-pvt-status';
      box.style.cssText = `
        position:fixed; right:18px; bottom:24px; z-index:2147483647;
        width:360px; max-width:calc(100vw - 36px); background:#0b1220; color:#fff;
        border-radius:18px; padding:16px; box-shadow:0 20px 60px rgba(0,0,0,.45);
        font-family:Arial,sans-serif; direction:ltr;
      `;
      document.documentElement.appendChild(box);
    }
    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="font-weight:800;margin-bottom:8px">One Click Dub · Audio Sync</div>
        <button id="ocd-pvt-close" style="border:0;border-radius:8px;padding:5px 8px;cursor:pointer;font-weight:800;background:#1f2937;color:white">×</button>
      </div>
      <div style="font-size:13px;line-height:1.45;opacity:.92">${escapeHtml(message)}</div>
      <div style="height:8px;background:#283244;border-radius:99px;margin-top:12px;overflow:hidden">
        <div style="height:100%;width:${Math.max(0, Math.min(100, progress))}%;background:#22c55e"></div>
      </div>
      ${actionsHtml || ''}
    `;
    const close = box.querySelector('#ocd-pvt-close');
    if (close) close.onclick = () => { box.remove(); box = null; };
    const stop = box.querySelector('#ocd-stop-audio');
    if (stop) stop.onclick = stopOverlayAudio;
    const resync = box.querySelector('#ocd-resync-audio');
    if (resync) resync.onclick = hardResync;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }


  function timeoutError(label, ms) {
    return new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Open chrome://extensions → One Click Dub → Service Worker → Inspect to see the real error.`);
  }

  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label, ms)), ms);
      })
    ]);
  }

  async function sendRuntimeMessageSafe(message, timeoutMs = 12000, label = 'Background message') {
    if (!chrome?.runtime?.sendMessage) throw new Error('Chrome runtime messaging is unavailable on this page. Reload the page and extension.');
    return withTimeout(chrome.runtime.sendMessage(message), timeoutMs, label);
  }

  async function getStorageSyncSafe(defaults, timeoutMs = 4000) {
    if (!chrome?.storage?.sync?.get) return { ...defaults };
    try {
      return await withTimeout(chrome.storage.sync.get(defaults), timeoutMs, 'Reading extension settings');
    } catch (error) {
      console.warn('[OCD] settings read failed; using defaults', error);
      return { ...defaults };
    }
  }

  async function startJob() {
    if (polling) return;
    show('Preparing video and settings...', 1);

    const video = getVideo();
    if (!video) return show('Could not find a video element on this page. Open a page that contains a playable video.', 0);

    const sourceUrl = getBestVideoUrl(video);
    if (!isSupportedPageUrl(sourceUrl)) {
      return show('This site is using a blob/data/DRM video source. Open the original public video page, or use a public https video URL.', 0);
    }

    let siteCookie = '';
    show('Preparing video and settings... reading cookies/settings', 1.5);
    try {
      const cookieRes = await sendRuntimeMessageSafe({ type: 'OCD_GET_SITE_COOKIES', url: location.href }, 2500, 'Reading site cookies');
      if (cookieRes?.ok && cookieRes.cookieString) siteCookie = cookieRes.cookieString;
    } catch (error) {
      // Cookies are optional. Never let cookie reading freeze the DUB button.
      console.warn('[OCD] could not read site cookies; continuing without cookies', error);
    }

    const settings = await getStorageSyncSafe({
      dubbingLanguage: 'ar-SA',
      targetLanguage: 'ar-SA',
      sourceLanguage: 'auto',
      voiceName: 'ar-SA-HamedNeural',
      modelName: 'fast'
    });

    const selectedModel = normalizeModelName(settings.modelName || 'fast');
    const targetLanguage = normalizeLang(settings.targetLanguage || settings.dubbingLanguage || 'ar');
    const selectedVoice = selectedModel === 'fast'
      ? normalizeVoice(settings.voiceName, settings.targetLanguage || settings.dubbingLanguage)
      : normalizeReferenceVoice(settings.voiceName);

    const label = selectedModel === 'pro'
      ? 'Pro / Fish Speech'
      : selectedModel === 'quality'
        ? 'Quality / OmniVoice'
        : 'Fast / Edge TTS';
    show(`Sending page/video to custom RunPod backend · ${label}...`, 2);
    const res = await sendRuntimeMessageSafe({
      type: 'OCD_PVT_START_JOB',
      payload: {
        url: sourceUrl,
        pageUrl: location.href,
        referer: location.href,
        cookieString: siteCookie,
        sourceLanguage: normalizeLang(settings.sourceLanguage || 'auto'),
        targetLanguage,
        voiceName: selectedVoice,
        modelName: selectedModel,
        ttsType: selectedModel === 'pro' ? 3 : selectedModel === 'quality' ? 2 : 0,
        whisperModel: selectedModel === 'fast' ? 'small' : 'large-v3',
        translationEngine: selectedModel === 'fast' ? 'google' : 'nllb200',
        cuda: true
      }
    }, 45000, 'Starting RunPod Serverless job');
    if (!res?.ok) return show(res?.error || 'Could not start custom dubbing job.', 100);
    pollJob(res.jobId);
  }


  function normalizeModelName(model) {
    const m = String(model || 'fast').toLowerCase().trim();
    if (m === 'quality' || m === 'omnivoice' || m === 'thinker') return 'quality';
    if (m === 'pro' || m === 'fish' || m === 'fish-speech' || m === 'fish-speech-s1-mini' || m === 'professional') return 'pro';
    return 'fast';
  }

  function normalizeReferenceVoice(voice) {
    const v = String(voice || '').trim();

    if (v === 'auto-clone-video' || v === 'auto-clone-from-video') return 'auto-clone-video';

    // Ready reference samples saved on RunPod under /runpod-volume/one-click-dub/ready_voice_refs.
    const ready = new Set([
      'auto-clone-video',
      'ocd-orion-male',
      'ocd-salem-male',
      'ocd-lina-female',
      'ocd-noura-female'
    ]);
    const key = v.toLowerCase();
    return ready.has(key) ? key : 'auto-clone-video';
  }

  function normalizeLang(code) {
    const c = String(code || '').toLowerCase();
    if (!c || c === 'auto') return 'auto';
    if (c.startsWith('ar')) return 'ar';
    if (c.startsWith('en')) return 'en';
    if (c.startsWith('fr')) return 'fr';
    if (c.startsWith('es')) return 'es';
    if (c.startsWith('de')) return 'de';
    return c.split('-')[0] || 'en';
  }

  function normalizeVoice(voice, lang) {
    const v = String(voice || '').trim();
    if (v.endsWith('Neural') && v.includes('-')) return v;
    const l = normalizeLang(lang || 'ar');
    if (l === 'ar') return 'ar-SA-HamedNeural';
    if (l === 'en') return 'en-US-RogerNeural';
    if (l === 'fr') return 'fr-FR-HenriNeural';
    if (l === 'es') return 'es-ES-AlvaroNeural';
    if (l === 'de') return 'de-DE-ConradNeural';
    return 'en-US-RogerNeural';
  }

  async function pollJob(jobId) {
    polling = true;
    dockExpanded = true;
    updateFloatingDock();
    try {
      while (true) {
        const res = await sendRuntimeMessageSafe({ type: 'OCD_PVT_JOB_STATUS', jobId }, 30000, 'Checking RunPod job status');
        if (!res?.ok) {
          show(res?.error || 'Job status failed.', 100);
          break;
        }

        show(`${res.status || ''}: ${res.message || ''}`, res.progress || 0);

        if (res.status === 'done') {
          const audioUrl = res.audioUrl || (res.outputKind === 'audio' ? res.outputUrl : '');
          if (!audioUrl) {
            show('Done, but the backend did not return audioUrl. Upload the fixed server file again.', 100);
            break;
          }
          await attachDubAudio(audioUrl, res);
          break;
        }
        if (res.status === 'soon') {
          show('Pro request reached RunPod, but this Pro endpoint is still running the old UI-preview worker. Rebuild the Pro Serverless endpoint with Dockerfile.pro + serverless_handler.py + colab_custom_dub_server.py, then redeploy.', 100);
          break;
        }
        if (res.status === 'error') break;
        await new Promise(r => setTimeout(r, 3500));
      }
    } finally {
      polling = false;
      updateFloatingDock();
    }
  }

  async function attachDubAudio(audioUrl, jobResult = {}) {
    const video = getVideo();
    if (!video) return show('Audio is ready, but the page video element was not found.', 100);

    stopOverlayAudio(false);

    show('Dubbed audio is ready. Verifying MP3 audio file from RunPod before playback...', 98);

    let audio = null;
    try {
      audio = await createPlayableAudio(audioUrl, video);
    } catch (error) {
      console.error('[OCD] audio load failed', error, audioUrl);
      return show(
        `Dubbed audio could not be played by Chrome, although the link may open manually. ${error?.message || ''} Server returned an audio URL, but Chrome could not play it directly or as Blob. Check RunPod /outputs headers and refresh this page.`,
        100
      );
    }

    const captions = extractCaptionsFromJobResult(jobResult);
    const filename = buildDubFilename(jobResult);
    lastDubResult = {
      audioUrl,
      filename,
      captions,
      meta: jobResult?.meta || {},
      completedAt: Date.now()
    };

    overlay = {
      audio,
      video,
      oldMuted: video.muted,
      oldVolume: video.volume,
      timer: null,
      handlers: {}
    };

    // Mute original audio only after the dubbed audio is confirmed playable.
    video.muted = true;

    overlay.handlers.play = () => playSynced();
    overlay.handlers.pause = () => audio.pause();
    overlay.handlers.seeking = () => syncNow(true);
    overlay.handlers.seeked = () => syncNow(true);
    overlay.handlers.ratechange = () => { audio.playbackRate = video.playbackRate || 1; };
    overlay.handlers.ended = () => audio.pause();

    video.addEventListener('play', overlay.handlers.play);
    video.addEventListener('pause', overlay.handlers.pause);
    video.addEventListener('seeking', overlay.handlers.seeking);
    video.addEventListener('seeked', overlay.handlers.seeked);
    video.addEventListener('ratechange', overlay.handlers.ratechange);
    video.addEventListener('ended', overlay.handlers.ended);

    overlay.timer = setInterval(() => syncNow(false), 600);

    syncNow(true);
    if (!video.paused) await playSynced();

    dockExpanded = true;
    updateFloatingDock();

    show(
      'Dubbed audio is now playing over the current page video. Original video audio is muted.',
      100,
      `<div style="display:flex;gap:8px;margin-top:12px">
        <button id="ocd-resync-audio" style="flex:1;border:0;border-radius:10px;padding:9px 10px;cursor:pointer;font-weight:800;background:#2563eb;color:white">Re-sync</button>
        <button id="ocd-stop-audio" style="flex:1;border:0;border-radius:10px;padding:9px 10px;cursor:pointer;font-weight:800;background:#ef4444;color:white">Stop</button>
      </div>`
    );
  }

  function withCacheBuster(url, attempt) {
    const raw = String(url || '');
    // Serverless direct mode may return a data:audio/mpeg;base64 URL. Do not append query params to data/blob URLs.
    if (/^(data:|blob:)/i.test(raw)) return raw;
    try {
      const u = new URL(raw);
      u.searchParams.set('ocd_audio_retry', String(attempt));
      u.searchParams.set('ocd_ts', String(Date.now()));
      return u.href;
    } catch {
      const join = raw.includes('?') ? '&' : '?';
      return `${raw}${join}ocd_audio_retry=${attempt}&ocd_ts=${Date.now()}`;
    }
  }

  async function createPlayableAudio(audioUrl, video) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const src = withCacheBuster(audioUrl, attempt);
      const audio = new Audio();
      // Do NOT set crossOrigin here. RunPod/StaticFiles links can play directly,
      // but CORS-mode media loading may fail even when the URL opens in a browser tab.
      audio.preload = 'auto';
      audio.volume = 1;
      audio.playbackRate = video.playbackRate || 1;

      try {
        await waitForAudioReady(audio, src, attempt === 1 ? 25000 : 35000);
        return audio;
      } catch (error) {
        lastError = error;
        try { audio.pause(); audio.src = ''; audio.load(); } catch {}
        await new Promise(r => setTimeout(r, 1200 * attempt));
      }
    }

    // Final fallback for Chrome media error code 4: fetch MP3 as a Blob, then play blob: URL.
    try {
      return await createBlobAudio(audioUrl, video);
    } catch (blobError) {
      const directMsg = lastError?.message || String(lastError || 'direct audio failed');
      const blobMsg = blobError?.message || String(blobError || 'blob fallback failed');
      throw new Error(`${directMsg}; Blob fallback failed: ${blobMsg}`);
    }
  }

  async function createBlobAudio(audioUrl, video) {
    const src = withCacheBuster(audioUrl, 'blob');
    const res = await fetch(src, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Audio fetch failed: HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob || blob.size < 1024) throw new Error('Audio blob is empty or too small');
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.__ocdObjectUrl = objectUrl;
    audio.preload = 'auto';
    audio.volume = 1;
    audio.playbackRate = video.playbackRate || 1;
    try {
      await waitForAudioReady(audio, objectUrl, 35000);
      return audio;
    } catch (error) {
      try { URL.revokeObjectURL(objectUrl); } catch {}
      throw error;
    }
  }

  function waitForAudioReady(audio, src, timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      const clean = () => {
        clearTimeout(timer);
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('loadedmetadata', onReady);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('stalled', onStalled);
      };
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        clean();
        fn(value);
      };
      const onReady = () => {
        if (Number.isFinite(audio.duration) || audio.readyState >= 2) finish(resolve, audio);
      };
      const onError = () => {
        const code = audio.error?.code || 'unknown';
        finish(reject, new Error(`Chrome media error code: ${code}`));
      };
      const onStalled = () => {
        // Do not fail immediately. RunPod proxy/static links can stall briefly while the file wakes up.
        console.warn('[OCD] dubbed audio stalled while loading, waiting...', src);
      };
      const timer = setTimeout(() => finish(reject, new Error('Audio load timeout')), timeoutMs);
      audio.addEventListener('canplay', onReady);
      audio.addEventListener('loadedmetadata', onReady);
      audio.addEventListener('error', onError);
      audio.addEventListener('stalled', onStalled);
      audio.src = src;
      try { audio.load(); } catch (error) { finish(reject, error); }
    });
  }

  async function playSynced() {
    if (!overlay) return;
    syncNow(true);
    try {
      await overlay.audio.play();
    } catch (error) {
      show('Click the video once, then press Play. Chrome blocked autoplay for the dubbed audio.', 100);
    }
  }

  function syncNow(force) {
    if (!overlay) return;
    const { audio, video } = overlay;
    if (!audio || !video) return;
    audio.playbackRate = video.playbackRate || 1;
    const drift = Math.abs((audio.currentTime || 0) - (video.currentTime || 0));
    if (force || drift > 0.35) {
      try { audio.currentTime = Math.max(0, video.currentTime || 0); } catch {}
    }
    if (video.paused && !audio.paused) audio.pause();
  }

  function hardResync() {
    syncNow(true);
    if (overlay && !overlay.video.paused) playSynced();
  }

  function stopOverlayAudio(showMessage = true) {
    if (!overlay) return;
    const { audio, video, oldMuted, oldVolume, timer, handlers } = overlay;
    if (timer) clearInterval(timer);
    try { audio.pause(); audio.src = ''; audio.load(); } catch {}
    try { if (audio.__ocdObjectUrl) URL.revokeObjectURL(audio.__ocdObjectUrl); } catch {}
    if (video) {
      video.removeEventListener('play', handlers.play);
      video.removeEventListener('pause', handlers.pause);
      video.removeEventListener('seeking', handlers.seeking);
      video.removeEventListener('seeked', handlers.seeked);
      video.removeEventListener('ratechange', handlers.ratechange);
      video.removeEventListener('ended', handlers.ended);
      video.muted = oldMuted;
      video.volume = oldVolume;
    }
    overlay = null;
    stopCustomCaptions(false);
    if (showMessage) show('Dubbed audio stopped. Original video audio restored.', 100);
    updateFloatingDock();
  }



  function updateFloatingDock() {
    const dock = document.getElementById('ocd-pvt-dock');
    if (!dock) return;
    const main = dock.querySelector('#ocd-pvt-btn');
    const actions = dock.querySelector('#ocd-pvt-actions');
    const captionBtn = dock.querySelector('#ocd-pvt-caption-btn');
    const downloadBtn = dock.querySelector('#ocd-pvt-download-btn');

    dock.classList.toggle('open', dockExpanded || polling || !!overlay || !!lastDubResult);
    dock.classList.toggle('busy', polling);
    dock.classList.toggle('ready', !!lastDubResult && !polling);
    if (actions) actions.setAttribute('aria-hidden', 'false');

    if (main) {
      main.title = overlay ? 'Stop dubbed audio' : polling ? 'Dubbing is processing' : 'Start dubbing this video';
      const label = main.querySelector('.ocd-pvt-label');
      if (label) label.textContent = overlay ? 'STOP' : polling ? 'DUB…' : 'DUB';
    }

    if (captionBtn) {
      captionBtn.classList.toggle('active', !!captionVisible);
      const hasCaption = !!(lastDubResult?.captions?.length);
      captionBtn.title = hasCaption ? 'Show / hide translated captions' : 'Captions will be available if the backend returns segment text';
    }

    if (downloadBtn) {
      const ready = !!lastDubResult?.audioUrl;
      downloadBtn.classList.toggle('ready', ready);
      downloadBtn.classList.toggle('disabled', !ready);
      downloadBtn.title = ready ? 'Download dubbed audio' : 'Download will unlock when dubbing is complete';
    }
  }

  function extractCaptionsFromJobResult(result = {}) {
    const meta = result?.meta || {};
    const candidates = [
      result.captions,
      result.segments,
      result.chunks,
      meta.captions,
      meta.segments,
      meta.chunks,
      meta.ttsChunks,
      meta.rawSegments,
      meta.translatedChunks,
      meta.timeline,
    ];

    for (const arr of candidates) {
      if (!Array.isArray(arr) || !arr.length) continue;
      const captions = arr.map((item, index) => {
        const start = Number(item.start ?? item.from ?? item.begin ?? item.t0 ?? 0);
        const end = Number(item.end ?? item.to ?? item.finish ?? item.t1 ?? (start + 3));
        const text = String(
          item.ttsText ||
          item.translatedText ||
          item.translation ||
          item.displayText ||
          item.text ||
          item.caption ||
          ''
        ).trim();
        return { index, start, end: Math.max(end, start + 0.25), text };
      }).filter(c => c.text && Number.isFinite(c.start) && Number.isFinite(c.end));
      if (captions.length) return captions;
    }
    return [];
  }

  function toggleCustomCaptions() {
    dockExpanded = true;
    if (!lastDubResult?.captions?.length) {
      show('Captions are not available yet. They will appear if the backend returns translated timeline segments with the completed dub.', 100);
      updateFloatingDock();
      return;
    }
    captionVisible = !captionVisible;
    if (captionVisible) startCustomCaptions();
    else stopCustomCaptions(false);
    updateFloatingDock();
  }

  function startCustomCaptions() {
    if (!captionBox) {
      captionBox = document.createElement('div');
      captionBox.id = 'ocd-pvt-caption-box';
      document.documentElement.appendChild(captionBox);
    }
    captionBox.classList.remove('hidden');
    if (captionTimer) clearInterval(captionTimer);
    captionTimer = setInterval(renderCustomCaption, 160);
    renderCustomCaption();
  }

  function stopCustomCaptions(hide = true) {
    if (captionTimer) clearInterval(captionTimer);
    captionTimer = null;
    if (hide && captionBox) captionBox.classList.add('hidden');
    captionVisible = false;
    updateFloatingDock();
  }

  function renderCustomCaption() {
    if (!captionVisible || !captionBox || !lastDubResult?.captions?.length) return;
    const video = overlay?.video || getVideo();
    const now = Number(video?.currentTime || 0);
    const current = lastDubResult.captions.find(c => c.start <= now + 0.12 && c.end >= now - 0.12);
    if (!current) {
      captionBox.classList.add('hidden');
      return;
    }
    captionBox.textContent = current.text;
    captionBox.classList.remove('hidden');
    positionCustomCaption(video);
  }

  function positionCustomCaption(video) {
    if (!captionBox || !video) return;
    try {
      const r = video.getBoundingClientRect();
      if (r.width > 120 && r.height > 80) {
        captionBox.style.left = `${Math.round(r.left + r.width / 2)}px`;
        captionBox.style.bottom = `${Math.max(16, Math.round(window.innerHeight - r.bottom + r.height * 0.10))}px`;
        captionBox.style.maxWidth = `${Math.max(280, Math.round(r.width * 0.86))}px`;
      }
    } catch {}
  }

  function buildDubFilename(result = {}) {
    const model = String(result.model || result.meta?.modelName || 'dub').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `one-click-dub-${model}-${stamp}.mp3`;
  }

  async function downloadLastDubAudio() {
    if (!lastDubResult?.audioUrl) {
      show('Download will be available after the dubbing is complete.', 100);
      updateFloatingDock();
      return;
    }
    try {
      const a = document.createElement('a');
      a.href = lastDubResult.audioUrl;
      a.download = lastDubResult.filename || 'one-click-dub-audio.mp3';
      a.style.display = 'none';
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      show('Downloading dubbed audio...', 100);
    } catch (error) {
      show(`Could not download audio: ${error?.message || error}`, 100);
    }
  }

  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'OCD_VIDEO_STATUS') {
      sendResponse({ hasVideo: !!getVideo(), dubbing: !!overlay || !!polling });
      return true;
    }
    if (message?.type === 'OCD_SETTINGS_CHANGED') {
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === 'OCD_START_CUSTOM_DUB') {
      startJob()
        .then(() => sendResponse({ ok: true }))
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === 'OCD_STOP_CUSTOM_DUB') {
      stopOverlayAudio(true);
      sendResponse({ ok: true });
      return true;
    }
  });

  ensureUi();
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      stopOverlayAudio(false);
      setTimeout(ensureUi, 700);
    }
  }, 1000);
})();
