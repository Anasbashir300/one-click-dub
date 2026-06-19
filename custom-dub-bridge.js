// One Click Dub custom backend bridge content script.
// Uses RunPod custom backend and plays returned audio in sync with the current page video on YouTube and other public sites.
(() => {
  if (window.__OCD_PVT_BRIDGE__) return;
  window.__OCD_PVT_BRIDGE__ = true;

  let box = null;
  let polling = false;
  let overlay = null;

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
    if (document.getElementById('ocd-pvt-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'ocd-pvt-btn';
    btn.textContent = '🎬 Dub';
    btn.title = 'Dub this public video/page with the custom AI backend on RunPod';
    btn.style.cssText = `
      position:fixed; right:18px; top:46%; z-index:2147483647;
      border:0; border-radius:16px; padding:12px 14px;
      background:#111827; color:white; font-weight:800; cursor:pointer;
      box-shadow:0 10px 30px rgba(0,0,0,.25); font-family:Arial,sans-serif;
    `;
    btn.addEventListener('click', startJob);
    document.documentElement.appendChild(btn);
  }

  function show(message, progress = 0, actionsHtml = '') {
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

  async function startJob() {
    if (polling) return;

    const video = getVideo();
    if (!video) return show('Could not find a video element on this page. Open a page that contains a playable video.', 0);

    const sourceUrl = getBestVideoUrl(video);
    if (!isSupportedPageUrl(sourceUrl)) {
      return show('This site is using a blob/data/DRM video source. Open the original public video page, or use a public https video URL.', 0);
    }

    let siteCookie = '';
    try {
      const cookieRes = await chrome.runtime.sendMessage({ type: 'OCD_GET_SITE_COOKIES', url: location.href });
      if (cookieRes?.ok && cookieRes.cookieString) siteCookie = cookieRes.cookieString;
    } catch (error) {
      console.warn('[OCD] could not read site cookies', error);
    }

    const settings = await chrome.storage.sync.get({
      dubbingLanguage: 'ar-SA',
      sourceLanguage: 'auto',
      voiceName: 'ar-SA-HamedNeural',
      modelName: 'fast'
    });

    const selectedModel = normalizeModelName(settings.modelName || 'fast');
    const targetLanguage = normalizeLang(settings.dubbingLanguage || 'ar');
    if (selectedModel === 'pro') {
      show('✨ Pro / Fish-Speech S1-mini is coming soon. Preview only — no backend job was started.', 100);
      return;
    }

    const selectedVoice = selectedModel === 'quality'
      ? normalizeOmniVoiceRole(settings.voiceName)
      : normalizeVoice(settings.voiceName, settings.dubbingLanguage);

    const label = selectedModel === 'quality' ? 'Quality / OmniVoice' : 'Fast / OpenAI Whisper Large + Edge TTS';
    show(`Sending page/video to custom RunPod backend · ${label}...`, 2);
    const res = await chrome.runtime.sendMessage({
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
        ttsType: selectedModel === 'quality' ? 2 : 0,
        whisperModel: selectedModel === 'quality' ? 'medium' : 'large',
        translationEngine: selectedModel === 'quality' ? 'nllb200' : 'google',
        cuda: true
      }
    });
    if (!res?.ok) return show(res?.error || 'Could not start custom dubbing job.', 100);
    pollJob(res.jobId);
  }


  function normalizeModelName(model) {
    const m = String(model || 'fast').toLowerCase().trim();
    if (m === 'quality' || m === 'omnivoice' || m === 'thinker') return 'quality';
    if (m === 'pro' || m === 'fish' || m === 'fish-speech' || m === 'fish-speech-s1-mini' || m === 'professional') return 'pro';
    return 'fast';
  }

  function normalizeOmniVoiceRole(voice) {
    const v = String(voice || '').trim();

    if (v === 'auto-clone-video' || v === 'auto-clone-from-video') return 'auto-clone-video';

    // Voice clone samples saved on RunPod under OCD_OMNIVOICE_REFS_DIR.
    // Keep these values exactly as filenames so the backend can locate them.
    if (/^sample_0[1-5]\.(wav|mp3|m4a|flac|ogg)$/i.test(v)) return v;

    const allowed = new Set([
      'design-male-deep-ar','design-male-warm-ar','design-female-soft-ar',
      'design-female-bright-ar','design-narrator-ar','nverguo.wav'
    ]);
    return allowed.has(v) ? v : 'design-male-deep-ar';
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
    try {
      while (true) {
        const res = await chrome.runtime.sendMessage({ type: 'OCD_PVT_JOB_STATUS', jobId });
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
          await attachDubAudio(audioUrl);
          break;
        }
        if (res.status === 'soon') {
          show(res.message || '✨ Pro / Fish-Speech S1-mini is coming soon.', 100);
          break;
        }
        if (res.status === 'error') break;
        await new Promise(r => setTimeout(r, 3500));
      }
    } finally {
      polling = false;
    }
  }

  async function attachDubAudio(audioUrl) {
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
    if (showMessage) show('Dubbed audio stopped. Original video audio restored.', 100);
  }

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
