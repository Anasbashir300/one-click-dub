(() => {
  // Compatibility guard: some YouTube/extension contexts or older bundled snippets may reference a global `g`.
  // Defining it prevents a bare ReferenceError without changing the dubbing pipeline.
  try { if (typeof globalThis.g === "undefined") globalThis.g = globalThis; } catch {}
  var g = globalThis;
  if (window.__ocdFastFreeEdgeV2) {
    window.__ocdApplyQuickButtonsFromStorage?.();
    return;
  }
  window.__ocdFastFreeEdgeV2 = true;

  const DEFAULTS = {
    targetLanguage: "en",
    dubbingLanguage: "en-US",
    voiceName: "en-US-RogerNeural",
    modelName: "fast",
    originalVolumeMode: "low",
    captions: true,
    quickButtons: true,
    dubbing: false,
    captionStyle: "tiktok",
    captionPosition: "bottom",
    captionSize: "large",
    captionColor: "yellow",
    captionAnimation: "pop"
  };

  const INITIAL_BATCH_SIZE = 6;
  const BACKGROUND_BATCH_SIZE = 4;
  const BATCH_SIZE = BACKGROUND_BATCH_SIZE;
  const FULL_PREDUB_CHUNK_SIZE = BACKGROUND_BATCH_SIZE;
  const LOOKAHEAD_SECONDS = 30;
  const PROCESS_INTERVAL_MS = 160;
  const LONG_TEXT_LIMIT = 40;
  const CAPTION_CAPTURE_WAIT_MS = 12000;
  const URGENT_PREBUFFER_SECONDS = 8;
  const SEEK_URGENT_BATCH_SIZE = 4;
  const SEEK_URGENT_WINDOW_MS = 15000;
  const PLAY_TOLERANCE_BEHIND_SECONDS = 2.2;
  const MIN_DUB_AUDIO_RATE = 0.85;
  // Keep dubbed speech understandable. Allow moderate compression while keeping speech mostly understandable.
  const MAX_DUB_AUDIO_RATE = 4.0;

  const capturedCaptionBuckets = new Map();
  let pageCaptureInstalled = false;
  const originalMediaStates = new WeakMap();
  let hardMuteTimer = null;

  let settings = { ...DEFAULTS };
  let positionTimer = null;
  let dub = null;

  function mainVideo() {
    const videos = [...document.querySelectorAll("video")].filter(v => {
      const r = v.getBoundingClientRect();
      return r.width > 120 && r.height > 80 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    });
    return videos.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0] || document.querySelector("video");
  }

  async function loadSettings() {
    try {
      settings = await chrome.storage.sync.get(DEFAULTS);
    } catch {
      settings = { ...DEFAULTS };
    }
    if (!["fast", "quality", "pro"].includes(settings.modelName)) settings.modelName = "fast";
  }

  async function saveSettings(patch = null) {
    if (patch) settings = { ...settings, ...patch };
    try { await chrome.storage.sync.set(settings); } catch {}
    applySettings();
  }

  function mount() {
    let root = document.getElementById("ocd-root");
    if (root) return root;
    root = document.createElement("div");
    root.id = "ocd-root";
    root.innerHTML = `
      <div class="quick-buttons hidden">
        <button class="quick-btn dub" data-action="dub" title="Fast free dubbing">🎙</button>
      </div>
      <div class="loader hidden"><div><div class="ring"></div><p>Preparing Fast free dubbing...</p></div></div>
      <div class="caption hidden"></div>
      <div class="toast hidden"></div>
    `;
    document.documentElement.appendChild(root);
    root.addEventListener("click", async event => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action === "dub") await toggleDub();
    });
    window.addEventListener("resize", positionCaption, { passive: true });
    window.addEventListener("scroll", positionCaption, { passive: true, capture: true });
    document.addEventListener("fullscreenchange", () => setTimeout(positionCaption, 60));
    return root;
  }

  function loader(show) { document.querySelector("#ocd-root .loader")?.classList.toggle("hidden", !show); }
  function toast(text) {
    const el = document.querySelector("#ocd-root .toast");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add("hidden"), 3400);
  }

  function applyOriginalVolume() {
    // YouTube can reset volume/mute while the page is running. In dubbing mode we
    // must silence every video element continuously, not just the first selected one.
    const videos = [...document.querySelectorAll("video")];
    for (const v of videos) {
      if (!originalMediaStates.has(v)) originalMediaStates.set(v, { volume: v.volume, muted: v.muted, playbackRate: v.playbackRate || 1 });
      try { v.muted = true; v.volume = 0; } catch {}
    }
    if (dub && !hardMuteTimer) {
      hardMuteTimer = setInterval(() => {
        if (!dub || dub.stopped) { clearInterval(hardMuteTimer); hardMuteTimer = null; return; }
        for (const v of document.querySelectorAll("video")) {
          try { v.muted = true; v.volume = 0; } catch {}
        }
      }, 120);
    }
  }

  function restoreOriginalVolume() {
    if (hardMuteTimer) { clearInterval(hardMuteTimer); hardMuteTimer = null; }
    for (const v of document.querySelectorAll("video")) {
      const st = originalMediaStates.get(v);
      try {
        if (st) { v.muted = st.muted; v.volume = st.volume; }
        else { v.muted = false; if (settings.originalVolumeMode === "normal") v.volume = 1; }
      } catch {}
    }
  }

  function applySettings() {
    const root = mount();
    root.querySelector(".quick-buttons")?.classList.toggle("hidden", !settings.quickButtons);
    root.querySelector(".quick-btn.dub")?.classList.toggle("active", !!settings.dubbing);
    if (dub) dub.settings = { ...settings };
    if (!settings.dubbing) hideCaption();
    else applyOriginalVolume();
  }

  window.__ocdApplyQuickButtonsFromStorage = async () => {
    await loadSettings();
    mount();
    applySettings();
  };

  function captionClass() {
    const animation = settings.captionAnimation === "none" ? "" : ` motion-${settings.captionAnimation || "pop"}`;
    return `caption style-${settings.captionStyle || "tiktok"} size-${settings.captionSize || "large"} color-${settings.captionColor || "yellow"}${animation}`;
  }

  function escapeHtml(s) { return String(s || "").replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c])); }

  function renderCaptionText(text) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    const mid = Math.min(words.length - 1, Math.max(0, Math.floor(words.length / 2)));
    const before = words.slice(0, mid).join(" ");
    const active = words[mid] || "";
    const after = words.slice(mid + 1).join(" ");
    if ((settings.captionStyle || "") === "karaoke" || (settings.captionAnimation || "") === "karaoke") {
      return `<span class="past">${escapeHtml(before)}</span> <span class="active">${escapeHtml(active)}</span> ${escapeHtml(after)}`;
    }
    return `${escapeHtml(before)} <span class="active">${escapeHtml(active)}</span> ${escapeHtml(after)}`;
  }

  function videoRect() {
    const v = mainVideo();
    if (!v) return null;
    const r = v.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return null;
    return r;
  }

  function positionCaption() {
    const cap = document.querySelector("#ocd-root .caption");
    const r = videoRect();
    if (!cap || !r || cap.classList.contains("hidden")) return;
    const safeX = Math.max(10, Math.min(40, r.width * 0.04));
    const safeY = Math.max(12, Math.min(42, r.height * 0.07));
    const maxWidth = Math.max(160, r.width - safeX * 2);
    cap.style.maxWidth = `${maxWidth}px`;
    const cr = cap.getBoundingClientRect();
    const capW = Math.min(cr.width || maxWidth, maxWidth);
    const capH = cr.height || 48;
    let left = r.left + r.width / 2;
    let top;
    const pos = settings.captionPosition || "bottom";
    if (pos === "top") top = r.top + safeY + capH / 2;
    else if (pos === "center") top = r.top + r.height / 2;
    else top = r.bottom - safeY - capH / 2;
    const minLeft = r.left + safeX + capW / 2;
    const maxLeft = r.right - safeX - capW / 2;
    if (maxLeft > minLeft) left = Math.max(minLeft, Math.min(maxLeft, left));
    const minTop = r.top + safeY + capH / 2;
    const maxTop = r.bottom - safeY - capH / 2;
    if (maxTop > minTop) top = Math.max(minTop, Math.min(maxTop, top));
    cap.style.left = `${left}px`;
    cap.style.top = `${top}px`;
    cap.style.setProperty("--ocd-transform", "translate(-50%, -50%)");
    cap.style.transform = "translate(-50%, -50%)";
  }

  function showCaption(text) {
    const cap = document.querySelector("#ocd-root .caption");
    if (!cap || !(settings.dubbing && settings.captions)) return;
    cap.className = captionClass();
    cap.innerHTML = renderCaptionText(text);
    cap.classList.remove("hidden");
    positionCaption();
    cap.classList.remove("motion-fade", "motion-pop", "motion-bounce", "motion-karaoke");
    void cap.offsetWidth;
    if (settings.captionAnimation && settings.captionAnimation !== "none") cap.classList.add(`motion-${settings.captionAnimation}`);
  }

  function hideCaption() { document.querySelector("#ocd-root .caption")?.classList.add("hidden"); }
  function installPositionTimer() { if (!positionTimer) positionTimer = setInterval(positionCaption, 350); }

  async function toggleDub() {
    const v = mainVideo();
    if (!v) { toast("No video found on this page"); return; }
    if (!settings.dubbing) {
      loader(true);
      try {
        await startFastFreeDubbing(v);
        await saveSettings({ dubbing: true });
        toast("Fast free dubbing started");
      } catch (error) {
        console.error("[OCD] One Click Dub start failed", error?.stack || error);
        toast(error?.message || "Could not start dubbing");
        stopFastFreeDubbing(false);
        await saveSettings({ dubbing: false });
      } finally {
        loader(false);
      }
    } else {
      stopFastFreeDubbing(true);
      await saveSettings({ dubbing: false });
      toast("Dubbing stopped");
    }
  }

  async function startFastFreeDubbing(v) {
    installPageCaptionCapture();
    stopFastFreeDubbing(false);
    installPositionTimer();
    const captions = await getYoutubeCaptions();
    if (!captions.length) throw new Error("No YouTube subtitles found. Fast free mode needs an existing caption track.");
    const textTrack = createDubbingTrack(v, normalizeTargetLanguage(settings.dubbingLanguage || settings.targetLanguage || "en"));
    dub = {
      video: v,
      originalVolume: v.volume,
      originalPlaybackRate: v.playbackRate || 1,
      originalMuted: v.muted,
      settings: { ...settings },
      captions,
      cursor: 0,
      processing: false,
      stopped: false,
      cache: new Map(),
      activeAudio: null,
      audioEl: createPersistentAudioElement(),
      activeCaptionIndex: null,
      activePlayToken: 0,
      activePlayPromise: null,
      nextSequentialIndex: null,
      lastSchedulerTick: 0,
      textTrack,
      textCues: new Map(),
      pausedByDub: false,
      monitor: null,
      pauseHandler: null,
      seekHandler: null,
      playHandler: null,
      waitingHandler: null,
      rateHandler: null,
      backgroundPreparing: false,
      backgroundPrepareStarted: false,
      generation: 0,
      preparing: new Set(),
      skipBeforeTime: Math.max(0, (v.currentTime || 0) - 0.25),
      lastHoldLogAt: 0,
      lastHoldLogKey: "",
      seekUrgentUntil: 0,
      lastSeekAt: 0,
      lastSeekTime: -1,
      backgroundRunId: 0
    };
    await unlockDubAudio(dub.audioEl);
    applyOriginalVolume();
    addCueShells();
    dub.pauseHandler = () => { if (!dub?.pausedByDub) stopActiveAudio(); };
    dub.seekHandler = () => handleVideoSeek();
    dub.playHandler = () => { if (dub) dub.pausedByDub = false; processDubQueue(); };
    dub.waitingHandler = () => processDubQueue();
    dub.rateHandler = () => syncActiveAudioRate("video-ratechange");
    v.addEventListener("pause", dub.pauseHandler);
    v.addEventListener("seeking", dub.seekHandler);
    v.addEventListener("seeked", dub.seekHandler);
    v.addEventListener("playing", dub.playHandler);
    v.addEventListener("waiting", dub.waitingHandler);
    v.addEventListener("ratechange", dub.rateHandler);
    // Streaming mode, like the original extension: prepare only the first small
    // batch before playback, then continue preparing the rest in the background.
    // This avoids the long wait caused by preparing the whole video up front.
    dub.pausedByDub = true;
    try { v.pause(); } catch {}
    seekCursorToTime(v.currentTime || 0);
    showCaption("Preparing first dubbing batch...");
    console.info("[OCD] STREAM MODE: preparing initial batch before playback", { captions: captions.length, initialBatchSize: INITIAL_BATCH_SIZE });
    await initialPrebufferBatch();
    if (!dub || dub.stopped) return;
    dub.pausedByDub = false;
    dub.monitor = setInterval(processDubQueue, PROCESS_INTERVAL_MS);
    showCaption("Dubbing ready. Preparing the rest in background...");
    console.info("[OCD] STREAM MODE: initial batch ready, starting playback", { cached: dub.cache.size, captions: dub.captions.length });
    prepareRemainingInBackground();
    try { await v.play(); } catch (error) { console.warn("[OCD] video play after initial prebuffer failed", error); }
    await processDubQueue();
  }

  function stopFastFreeDubbing(clearCaption) {
    if (!dub) { if (clearCaption) hideCaption(); return; }
    const s = dub;
    s.stopped = true;
    stopActiveAudio();
    if (s.audioEl) { try { s.audioEl.pause(); s.audioEl.removeAttribute("src"); s.audioEl.load(); s.audioEl.remove(); } catch {} }
    clearInterval(s.monitor);
    s.video?.removeEventListener("pause", s.pauseHandler);
    s.video?.removeEventListener("seeking", s.seekHandler);
    s.video?.removeEventListener("seeked", s.seekHandler);
    s.video?.removeEventListener("playing", s.playHandler);
    s.video?.removeEventListener("waiting", s.waitingHandler);
    s.video?.removeEventListener("ratechange", s.rateHandler);
    for (const item of s.cache.values()) if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
    try {
      for (const cue of [...s.textCues.values()]) s.textTrack?.removeCue(cue);
    } catch {}
    restoreOriginalVolume();
    s.video.playbackRate = s.originalPlaybackRate || 1;
    dub = null;
    if (clearCaption) hideCaption();
  }

  function createPersistentAudioElement() {
    const audio = document.createElement("audio");
    audio.id = "ocd-dub-audio";
    audio.preload = "auto";
    audio.autoplay = false;
    audio.controls = false;
    audio.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.documentElement.appendChild(audio);
    return audio;
  }

  async function unlockDubAudio(audio) {
    // A short silent play attempt must happen as early as possible after the user's
    // Start click. If Chrome blocks it, later play() calls will log the real error.
    if (!audio || audio.__ocdUnlocked) return;
    try {
      audio.volume = 0;
      audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
      audio.volume = 1;
      audio.__ocdUnlocked = true;
      console.info("[OCD] dub audio element unlocked");
    } catch (error) {
      audio.volume = 1;
      console.warn("[OCD] dub audio unlock failed; user may need to click the video once", error);
    }
  }

  function createDubbingTrack(v, language) {
    const existing = [...(v.textTracks || [])].find(t => t.label === "one-click-dub-fast-free");
    if (existing) {
      existing.mode = "hidden";
      try { for (const cue of [...existing.cues || []]) existing.removeCue(cue); } catch {}
      return existing;
    }
    const track = v.addTextTrack("subtitles", "one-click-dub-fast-free", language);
    track.mode = "hidden";
    return track;
  }

  function addCueShells() {
    if (!dub?.textTrack) return;
    for (const caption of dub.captions) {
      try {
        const cue = new VTTCue(caption.start, caption.end, "");
        cue.id = `ocd-${caption.index}`;
        cue.line = "auto";
        cue.addEventListener("enter", () => onCueEnter(caption));
        cue.addEventListener("exit", () => onCueExit(caption));
        dub.textTrack.addCue(cue);
        dub.textCues.set(caption.index, cue);
      } catch (error) {
        console.warn("Could not add cue", error);
      }
    }
  }

  async function onCueEnter(caption) {
    if (!dub || dub.stopped) return;
    // After a manual seek, YouTube may fire stale cue-enter events while the
    // video is paused. Do not let those events start audio by themselves; the
    // scheduler will prepare a small urgent batch at the new playhead and start
    // exactly one line.
    if (dub.pausedByDub && dub.video?.paused) {
      processDubQueue();
      return;
    }
    await maybePlayCaption(caption);
    processDubQueue();
  }

  function onCueExit(caption) {
    // Do not stop dubbed audio merely because the text cue ended. Local TTS can
    // be slightly longer than the YouTube caption window; stopping here is what
    // caused audible cutting. The scheduler will stop the previous audio only
    // when the next dubbed caption is ready to start.
    if (!dub) return;
    processDubQueue();
  }

  function handleVideoSeek() {
    const s = dub;
    if (!s || s.stopped) return;
    const t = Number(s.video?.currentTime || 0);
    const nowMs = Date.now();

    // YouTube fires both `seeking` and `seeked` for the same jump. Treat them
    // as one seek; otherwise generation increments twice and the first urgent
    // audio result is rejected as stale, causing long silence after jumps.
    if (nowMs - Number(s.lastSeekAt || 0) < 350 && Math.abs(t - Number(s.lastSeekTime || -9999)) < 0.35) {
      setTimeout(() => { if (dub === s && !s.stopped) processDubQueue(); }, 40);
      return;
    }

    s.lastSeekAt = nowMs;
    s.lastSeekTime = t;
    s.generation = (s.generation || 0) + 1;
    s.backgroundRunId = (s.backgroundRunId || 0) + 1;
    s.skipBeforeTime = Math.max(0, t - 0.10);
    s.seekUrgentUntil = Date.now() + SEEK_URGENT_WINDOW_MS;
    s.pausedByDub = true;
    s.processing = false;
    s.backgroundPreparing = false;
    s.preparing = new Set();
    stopActiveAudio();
    seekCursorToTime(t, true);
    try { s.video.pause(); } catch {}
    showCaption("Preparing audio after seek...");
    console.info("[OCD] seek generation reset", { generation: s.generation, time: t });
    setTimeout(() => { if (dub === s && !s.stopped) processDubQueue(); }, 40);
  }

  function seekCursorToTime(time, fromSeek = false) {
    if (!dub) return;
    const safeTime = Number(time || 0);
    const idx = dub.captions.findIndex(c => c.end >= safeTime - 0.15);
    dub.cursor = idx >= 0 ? idx : 0;
    dub.activeCaptionIndex = null;
    if (fromSeek) {
      // Never replay captions that ended before the new seek position. If the
      // playhead lands deep inside a caption, skip that partial line and start
      // from the next caption; this prevents replaying an old sentence after seek.
      const current = dub.captions[idx] || null;
      const deepInsideCurrent = current && safeTime > current.start + 0.85 && current.end - safeTime < 2.5;
      dub.skipBeforeTime = Math.max(0, deepInsideCurrent ? safeTime + 0.05 : safeTime - 0.10);
    }
    for (const [key, item] of dub.cache.entries()) {
      const c = dub.captions.find(x => x.index === key);
      if (!c) continue;
      if (c.end < safeTime - 0.35) item.played = true;
      else item.played = false;
    }
  }

  async function prepareFullDubbingBeforePlayback() {
    const s = dub;
    if (!s || s.stopped) return false;
    const total = s.captions.length;
    s.processing = true;
    try {
      for (let offset = 0; offset < s.captions.length; offset += FULL_PREDUB_CHUNK_SIZE) {
        if (!dub || s.stopped) return;
        const chunk = s.captions
          .slice(offset, offset + FULL_PREDUB_CHUNK_SIZE)
          .filter(c => !s.cache.has(c.index));
        if (!chunk.length) continue;
        const doneBefore = s.cache.size;
        showCaption(`Preparing full dubbing ${Math.min(doneBefore + chunk.length, total)}/${total}...`);
        console.info("[OCD] FULL MODE: preparing chunk", { from: offset, count: chunk.length, doneBefore, total, indexes: chunk.map(c => c.index) });
        await prepareCaptionBatch(chunk);
        console.info("[OCD] FULL MODE: chunk ready", { cached: s.cache.size, total });
      }
      const missing = s.captions.filter(c => !s.cache.has(c.index));
      if (missing.length) {
        throw new Error(`Full dubbing cache incomplete: ${s.cache.size}/${total}`);
      }
    } finally {
      if (s) s.processing = false;
    }
  }

  async function initialPrebufferBatch() {
    const s = dub;
    if (!s || s.stopped || s.processing) return;
    const start = firstUsefulCaptionIndex(s.video?.currentTime || 0);
    const batch = [];
    for (let i = start; i < s.captions.length && batch.length < INITIAL_BATCH_SIZE; i++) {
      const c = s.captions[i];
      if (!s.cache.has(c.index) && !s.preparing?.has(c.index)) batch.push(c);
    }
    if (!batch.length) return;
    s.processing = true;
    try {
      showCaption("Preparing first audio batch...");
      console.info("[OCD] initial prebuffer batch", batch.map(c => c.index));
      await prepareCaptionBatch(batch);
    } catch (error) {
      console.error("[OCD] initial prebuffer failed", error?.stack || error);
      toast(error?.message || "Initial audio prebuffer failed");
    } finally {
      s.processing = false;
    }
  }

  async function prepareRemainingInBackground() {
    const s = dub;
    if (!s || s.stopped || s.backgroundPreparing) return;
    // Immediately after seek, do not let background work compete with the small
    // urgent batch. This was the main reason Colab kept generating old/far audio
    // while the current playhead waited.
    if (Date.now() < Number(s.seekUrgentUntil || 0)) return;

    const runId = s.backgroundRunId || 0;
    const generation = s.generation || 0;
    s.backgroundPreparing = true;
    s.backgroundPrepareStarted = true;
    try {
      while (dub === s && !s.stopped && runId === (s.backgroundRunId || 0) && generation === (s.generation || 0)) {
        if (Date.now() < Number(s.seekUrgentUntil || 0)) break;
        const startFrom = firstUsefulCaptionIndex((s.video?.currentTime || 0) + 0.25);
        const batch = [];
        for (let i = startFrom; i < s.captions.length && batch.length < BACKGROUND_BATCH_SIZE; i++) {
          const c = s.captions[i];
          if (!s.cache.has(c.index) && !s.preparing?.has(c.index)) batch.push(c);
        }
        if (!batch.length) {
          console.info("[OCD] background dubbing cache complete", { cached: s.cache.size, captions: s.captions.length });
          break;
        }
        console.info("[OCD] background preparing batch", batch.map(c => c.index));
        await prepareCaptionBatch(batch, "background");
        await new Promise(resolve => setTimeout(resolve, 120));
      }
    } catch (error) {
      console.error("[OCD] background dubbing preparation failed", error?.stack || error);
      // Do not keep the video paused forever because a background batch failed.
      // Urgent scheduler will retry the exact needed caption.
    } finally {
      if (s) s.backgroundPreparing = false;
    }
  }

  async function processDubQueue() {
    const s = dub;
    if (!s || s.stopped) return;
    const v = s.video;
    if (!v || v.ended) return;
    applyOriginalVolume();

    const now = v.currentTime;
    s.lastSchedulerTick = Date.now();

    // Pick the earliest not-played caption near or ahead of the current playback.
    // This is deliberately stricter than relying on VTTCue events: if TTS is late,
    // the video is paused until the next audio is ready instead of continuing with
    // the original YouTube voice.
    let next = findNextUnplayedCaption(now);
    if (!next) {
      hideCaption();
      return;
    }

    // Prepare audio for the next unplayed caption. Immediately after a seek,
    // keep the urgent batch very small so the user does not wait for old/large
    // batches. Background preparation will continue after the first new line.
    const urgentAfterSeek = Date.now() < Number(s.seekUrgentUntil || 0);
    const batchLimit = urgentAfterSeek ? SEEK_URGENT_BATCH_SIZE : BATCH_SIZE;
    const batch = [];
    const startPos = s.captions.findIndex(c => c.index === next.index);
    for (let i = Math.max(0, startPos); i < s.captions.length && batch.length < batchLimit; i++) {
      const c = s.captions[i];
      if (c.start > now + LOOKAHEAD_SECONDS && batch.length) break;
      if (!s.cache.has(c.index) && !s.preparing?.has(c.index)) batch.push(c);
    }

    // If the video is about to reach a caption that is not ready, pause it.
    const nearNext = next.start <= now + URGENT_PREBUFFER_SECONDS;
    if (nearNext && !s.cache.has(next.index) && !v.paused) {
      s.pausedByDub = true;
      v.pause();
      showCaption("Preparing audio...");
      console.info("[OCD] strict pause until dub audio is ready", { current: now, index: next.index, start: next.start, batch: batch.map(c => c.index) });
    }

    if (batch.length && !s.processing && nearNext && !s.cache.has(next.index)) {
      s.processing = true;
      try {
        console.info("[OCD] urgent preparing batch", { indexes: batch.map(c => c.index), seekUrgent: urgentAfterSeek, generation: s.generation });
        await prepareCaptionBatch(batch);
      } catch (error) {
        console.error("[OCD] Fast free urgent batch failed", error?.stack || error);
        toast(error?.message || "Fast free dubbing failed");
      } finally {
        s.processing = false;
      }
    } else if (batch.length && !s.processing && !s.backgroundPreparing && !urgentAfterSeek) {
      prepareRemainingInBackground();
    }

    next = findNextUnplayedCaption(v.currentTime);
    if (!next) return;

    const cached = s.cache.get(next.index);
    if (cached && next.start <= v.currentTime + 0.65 && next.end >= v.currentTime - 2.5) {
      const started = await maybePlayCaption(next, "strict-scheduler");
      if (started && s.pausedByDub && v.paused) {
        s.pausedByDub = false;
        console.info("[OCD] resume video with dubbed audio", { index: next.index });
        v.play().catch(() => {});
      } else if (!started && !s.stopped) {
        // Do not let YouTube continue with the original audio when dubbed audio
        // failed to start or is waiting for the previous line to finish.
        s.pausedByDub = true;
        try { v.pause(); } catch {}
      }
      return;
    }

    if (s.pausedByDub && v.paused && !s.processing) {
      if (s.cache.has(next.index) || next.start > v.currentTime + URGENT_PREBUFFER_SECONDS) {
        s.pausedByDub = false;
        console.info("[OCD] resume video after buffer", { next: next.index });
        v.play().catch(() => {});
      } else {
        showCaption("Preparing audio...");
      }
    }
  }

  function findNextUnplayedCaption(time) {
    if (!dub) return null;
    const t = Number(time || 0);
    // Do not pick captions behind the current video position. The old 2.5s
    // tolerance made the scheduler go backwards after seek, which repeated the
    // first sentence at the new position.
    const lowerBound = Math.max(t - 0.35, Number(dub.skipBeforeTime || 0));
    return dub.captions.find(c => {
      const cached = dub.cache.get(c.index);
      if (cached?.played) return false;
      return c.end >= lowerBound;
    }) || null;
  }

  function findUrgentMissingCaption(time) {
    if (!dub) return null;
    return dub.captions.find(c =>
      c.end >= time - PLAY_TOLERANCE_BEHIND_SECONDS &&
      c.start <= time + URGENT_PREBUFFER_SECONDS &&
      !dub.cache.has(c.index)
    ) || null;
  }

  function findPlayableCaption(time) {
    if (!dub) return null;
    const active = findCaptionAt(time);
    if (active && dub.cache.has(active.index)) return active;
    // If TTS finished slightly late, still play the nearest cue instead of
    // silently skipping it. This makes the pipeline resilient to local TTS latency.
    return dub.captions.find(c =>
      dub.cache.has(c.index) &&
      !dub.cache.get(c.index)?.played &&
      c.start <= time + 0.2 &&
      c.end >= time - PLAY_TOLERANCE_BEHIND_SECONDS
    ) || null;
  }

  function firstUsefulCaptionIndex(time) {
    if (!dub) return 0;
    const idx = dub.captions.findIndex(c => c.end >= time - 1);
    return idx >= 0 ? idx : 0;
  }

  function findCaptionAt(time) {
    if (!dub) return null;
    // Poll the whole normalized caption list. Do not rely on TextTrack events only;
    // hidden VTTCue enter/exit events can be missed on YouTube SPA navigation.
    return dub.captions.find(c => c.start <= time + 0.12 && c.end >= time - 0.12) || null;
  }

  async function maybePlayCaption(caption, reason = "cue") {
    const s = dub;
    if (!s || s.stopped) return false;
    const cached = s.cache.get(caption.index);
    if (!cached) {
      if (!s.processing && caption.start <= s.video.currentTime + 0.75 && !s.video.paused) {
        s.pausedByDub = true;
        s.video.pause();
        showCaption("Preparing audio...");
        console.info("[OCD] active caption is waiting for audio", { index: caption.index });
      }
      return false;
    }

    if (cached.played && s.activeCaptionIndex !== caption.index) return false;
    const videoNow = Number(s.video?.currentTime || 0);
    if (caption.end < videoNow - 0.35 || (Date.now() < Number(s.seekUrgentUntil || 0) && caption.start < videoNow - 0.90)) {
      cached.played = true;
      console.info("[OCD] skipped stale/partial caption behind playhead", { index: caption.index, now: s.video?.currentTime, start: caption.start, end: caption.end });
      return false;
    }

    showCaption(cached.displayText || cached.translation || caption.text);
    applyOriginalVolume();

    if (s.activeCaptionIndex === caption.index && s.audioEl && !s.audioEl.paused) return true;

    // Never cut a currently spoken dubbed sentence to jump to the next caption.
    // Edge TTS often produces audio that is longer than the YouTube caption window;
    // stopping it here is what causes half-words to be chopped. Instead, hold the
    // video muted until the active audio finishes, then continue scheduling.
    if (s.activeAudio && !s.activeAudio.paused && s.activeCaptionIndex !== caption.index) {
      s.pausedByDub = true;
      try { s.video.pause(); } catch {}
      const holdKey = `${s.activeCaptionIndex}->${caption.index}`;
      const holdNow = Date.now();
      if (s.lastHoldLogKey !== holdKey || holdNow - (s.lastHoldLogAt || 0) > 1200) {
        s.lastHoldLogKey = holdKey;
        s.lastHoldLogAt = holdNow;
        console.info("[OCD] holding next caption until current dubbed audio finishes", {
          active: s.activeCaptionIndex,
          waiting: caption.index,
          now: s.video.currentTime
        });
      }
      return false;
    }

    const src = cached.objectUrl || cached.dataUrl;
    if (!src) {
      console.warn("[OCD] missing audio source for caption", caption.index);
      return false;
    }

    const audio = s.audioEl || createPersistentAudioElement();
    s.audioEl = audio;
    const playToken = ++s.activePlayToken;
    try {
      // Avoid the AbortError loop caused by pausing an audio element while a
      // previous play() promise is still pending. Only reset when needed.
      if (!audio.paused) audio.pause();
      audio.currentTime = 0;
      if (audio.src !== src) {
        audio.src = src;
        audio.load();
      }
    } catch {}
    audio.volume = 1;
    audio.muted = false;
    try { audio.setAttribute("playsinline", ""); } catch {}
    applyOriginalVolume();
    audio.preload = "auto";
    s.activeAudio = audio;
    s.activeCaptionIndex = caption.index;
    cached.played = true;

    console.info("[OCD] playing dubbed caption", {
      index: caption.index,
      reason,
      start: caption.start,
      end: caption.end,
      now: s.video.currentTime,
      hasObjectUrl: !!cached.objectUrl,
      hasDataUrl: !!cached.dataUrl
    });

    const audioRate = computeDubAudioRate(caption, audio);
    try { audio.playbackRate = audioRate; } catch {}
    audio.onloadedmetadata = () => {
      const r = computeDubAudioRate(caption, audio);
      try { audio.playbackRate = r; } catch {}
      console.info("[OCD] synced dubbed audio rate", { index: caption.index, videoRate: s.video.playbackRate || 1, audioRate: r, audioDuration: audio.duration || 0, cueDuration: Math.max(0.05, caption.end - caption.start) });
    };
    audio.onended = () => {
      if (s.activeAudio === audio) s.activeAudio = null;
      if (s.activeCaptionIndex === caption.index) s.activeCaptionIndex = null;
      // If we paused the video to avoid cutting the line, resume only after the
      // sentence fully finishes. This trades small pauses for complete words.
      if (s.pausedByDub && s.video && s.video.paused && !s.stopped) {
        s.pausedByDub = false;
        console.info("[OCD] current dubbed audio finished; resuming video", { index: caption.index });
        try { s.video.play().catch(() => {}); } catch {}
      }
      processDubQueue();
    };
    audio.onerror = () => {
      console.warn("[OCD] dub audio element error", audio.error);
      if (s.activeAudio === audio) s.activeAudio = null;
      if (s.activeCaptionIndex === caption.index) s.activeCaptionIndex = null;
      processDubQueue();
    };

    let playPromise = null;
    try {
      playPromise = audio.play();
      s.activePlayPromise = playPromise;
      await playPromise;
      if (!dub || s.stopped || playToken !== s.activePlayToken) return false;
      console.info("[OCD] dubbed audio started", { index: caption.index });
      return true;
    } catch (error) {
      if (!dub || s.stopped || playToken !== s.activePlayToken) return false;
      console.warn("[OCD] Dub audio play failed; pausing video to preserve sync", error);
      cached.played = false;
      if (s.activeAudio === audio) s.activeAudio = null;
      if (s.activeCaptionIndex === caption.index) s.activeCaptionIndex = null;
      s.pausedByDub = true;
      try { s.video.pause(); } catch {}
      showCaption("Audio was interrupted. Preparing again...");
      setTimeout(() => { if (dub === s && !s.stopped) processDubQueue(); }, 250);
      return false;
    } finally {
      if (s.activePlayPromise === playPromise) s.activePlayPromise = null;
    }
  }

  function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function computeDubAudioRate(caption, audio) {
    const s = dub;
    const rawVideoRate = Number(s?.video?.playbackRate || 1);
    // Follow the actual YouTube playback rate. If the user plays at 2x, dubbed
    // speech must also speed up; otherwise the next caption arrives early and
    // interrupts the current line.
    const videoRate = clampNumber(rawVideoRate, MIN_DUB_AUDIO_RATE, MAX_DUB_AUDIO_RATE);
    const cueDuration = Math.max(0.08, Number(caption?.end || 0) - Number(caption?.start || 0));
    const audioDuration = Number(audio?.duration || 0);
    let required = videoRate;
    if (audioDuration > 0) {
      required = Math.max(videoRate, Math.min(MAX_DUB_AUDIO_RATE, (audioDuration * videoRate) / cueDuration));
    }
    return clampNumber(required, MIN_DUB_AUDIO_RATE, MAX_DUB_AUDIO_RATE);
  }

  function syncActiveAudioRate(reason = "sync") {
    const s = dub;
    if (!s?.activeAudio || s.activeCaptionIndex == null) return;
    const caption = s.captions.find(c => c.index === s.activeCaptionIndex);
    if (!caption) return;
    const r = computeDubAudioRate(caption, s.activeAudio);
    try { s.activeAudio.playbackRate = r; } catch {}
    console.info("[OCD] active dubbed audio rate synced", { reason, index: caption.index, videoRate: s.video?.playbackRate || 1, audioRate: r });
  }

  function stopActiveAudio() {
    if (!dub) return;
    dub.activePlayToken = (dub.activePlayToken || 0) + 1;
    if (!dub.activeAudio) return;
    try { dub.activeAudio.pause(); dub.activeAudio.currentTime = 0; } catch {}
    dub.activeAudio = null;
    dub.activeCaptionIndex = null;
  }

  async function prepareCaptionBatch(batch, mode = "normal") {
    const s = dub;
    if (!s || !batch.length) return;
    const generation = s.generation || 0;
    const realBatch = [];
    for (const c of batch) {
      if (!c || s.cache.has(c.index) || s.preparing?.has(c.index)) continue;
      realBatch.push(c);
      s.preparing?.add(c.index);
    }
    if (!realBatch.length) return;
    const targetLanguage = normalizeTargetLanguage(settings.dubbingLanguage || settings.targetLanguage || "en");
    const voiceName = settings.voiceName || defaultEdgeVoiceFor(targetLanguage);
    const payload = {
      chain: "FRONTEND_EDGE_AZURE",
      model: "fast",
      voiceType: "free",
      targetLanguage,
      voiceName,
      videoId: currentVideoId(),
      generation,
      requestId: `${currentVideoId() || "video"}:${generation}:${Date.now()}:${realBatch.map(c => c.index).join("-")}`,
      priority: Date.now() < Number(s.seekUrgentUntil || 0) ? "seek" : mode,
      subtitles: realBatch.map(c => ({ index: c.index, text: c.text, start: c.start, end: c.end }))
    };
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: "OCD_FAST_FREE_PREPARE_BATCH", payload });
    } finally {
      for (const c of realBatch) s.preparing?.delete(c.index);
    }
    if (!response?.ok) throw new Error(response?.error || "Fast free Edge TTS failed");
    if (!dub || dub !== s || s.stopped || generation !== (s.generation || 0)) {
      console.info("[OCD] ignoring stale prepare-batch result after seek", { generation, currentGeneration: s.generation });
      return;
    }
    for (const item of response.results || []) {
      const original = s.captions.find(c => c.index === item.index);
      if (!original) continue;
      const translated = item.translation || original.text;
      const displayText = splitLongTextForDisplay(translated, LONG_TEXT_LIMIT).join("\n");
      let objectUrl = "";
      if (item.audioBase64) objectUrl = URL.createObjectURL(base64ToBlob(item.audioBase64, "audio/mpeg"));
      console.info("[OCD] cached dubbed audio", { index: item.index, audioBytes: item.audioBase64 ? Math.round(item.audioBase64.length * 0.75) : 0, provider: item.provider });
      s.cache.set(item.index, {
        translation: translated,
        displayText,
        objectUrl,
        dataUrl: item.audioDataUrl || "",
        provider: item.provider || "edge",
        played: false
      });
      const cue = s.textCues.get(item.index);
      if (cue) cue.text = `<c.one-click-dub-cue>${displayText}</c>`;
    }
  }

  function splitLongTextForDisplay(text, limit) {
    const s = String(text || "").trim();
    if (s.length <= limit) return [s];
    const parts = [];
    let rest = s;
    while (rest.length > limit) {
      let cut = Math.max(rest.lastIndexOf(". ", limit), rest.lastIndexOf("! ", limit), rest.lastIndexOf("? ", limit), rest.lastIndexOf(", ", limit), rest.lastIndexOf("; ", limit), rest.lastIndexOf(": ", limit));
      if (cut < Math.floor(limit * 0.45)) cut = rest.lastIndexOf(" ", limit);
      if (cut < 1) cut = limit;
      parts.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) parts.push(rest);
    return parts;
  }

  function base64ToBlob(base64, mime) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function normalizeTargetLanguage(code) {
    if (!code || code === "auto") return "en-US";
    const c = String(code).replace("_", "-");
    const lower = c.toLowerCase();
    if (lower === "ar") return "ar-SA";
    if (lower === "en") return "en-US";
    if (lower === "es") return "es-ES";
    if (lower === "fr") return "fr-FR";
    if (lower === "de") return "de-DE";
    if (lower === "it") return "it-IT";
    if (lower === "pt") return "pt-BR";
    if (lower === "zh") return "zh-CN";
    return c;
  }

  function defaultEdgeVoiceFor(lang) {
    const l = normalizeTargetLanguage(lang).toLowerCase();
    if (l.startsWith("ar-eg")) return "ar-EG-ShakirNeural";
    if (l.startsWith("ar")) return "ar-SA-HamedNeural";
    if (l.startsWith("es")) return "es-ES-AlvaroNeural";
    if (l.startsWith("fr")) return "fr-FR-HenriNeural";
    if (l.startsWith("de")) return "de-DE-ConradNeural";
    if (l.startsWith("it")) return "it-IT-DiegoNeural";
    if (l.startsWith("pt")) return "pt-BR-AntonioNeural";
    if (l.startsWith("ru")) return "ru-RU-DmitryNeural";
    if (l.startsWith("ja")) return "ja-JP-KeitaNeural";
    if (l.startsWith("ko")) return "ko-KR-InJoonNeural";
    if (l.startsWith("zh")) return "zh-CN-YunxiNeural";
    if (l.startsWith("hi")) return "hi-IN-MadhurNeural";
    if (l.startsWith("tr")) return "tr-TR-AhmetNeural";
    return "en-US-RogerNeural";
  }

  async function getYoutubeCaptions() {
    installPageCaptionCapture();
    const tracks = await findCaptionTracks();
    const preferredTracks = orderCaptionTracks(tracks || []);
    const errors = [];

    // Primary path: ask the local server for a complete transcript. The server now uses
    // yt-dlp first, which avoids the repeated empty timedtext/caption proxy attempts.
    try {
      const transcript = await fetchTranscriptFromLocalServer(preferredTracks);
      if (transcript.length) {
        console.info("[OCD] using local yt-dlp transcript", transcript.length);
        return transcript;
      }
    } catch (error) {
      errors.push("local-yt-dlp-transcript: " + (error?.message || error));
      console.warn("[OCD] local yt-dlp transcript failed", error);
    }

    // Optional debug fallback. Disabled by default because it caused the repeated
    // `caption proxy ... bytes 0` spam and wasted time on your videos.
    if (window.OCD_ENABLE_CAPTION_PROXY_DEBUG === true) {
      console.info("[OCD] caption proxy debug enabled", tracks.length, tracks.map(t => ({ lang: t.languageCode, name: readTrackName(t), kind: t.kind })));
      for (const track of preferredTracks) {
        const variants = buildCaptionUrlVariants(track.baseUrl, track);
        for (const url of variants) {
          try {
            const captions = await fetchAndParseCaptionUrl(url);
            if (captions.length) {
              console.info("[OCD] using caption track", readTrackName(track), track.languageCode, captions.length);
              return captions;
            }
            errors.push(`${track.languageCode || "unknown"}: empty/invalid captions`);
          } catch (error) {
            errors.push(`${track.languageCode || "unknown"}: ${error?.message || error}`);
          }
        }
      }
    }

    try {
      const captured = await waitForCapturedCaptionNetwork(preferredTracks);
      if (captured.length) {
        console.info("[OCD] using page network captured captions", captured.length);
        return captured;
      }
    } catch (error) {
      errors.push("page-network-capture: " + (error?.message || error));
      console.warn("[OCD] page network caption capture failed", error);
    }

    throw new Error("Could not read YouTube captions via yt-dlp/local server. Last error: " + (errors.slice(-1)[0] || "no usable captions"));
  }

  async function fetchTranscriptFromLocalServer(preferredTracks) {
    const videoId = currentVideoId();
    if (!videoId) return [];
    const target = normalizeTargetLanguage(settings.targetLanguage || settings.dubbingLanguage || "en").split("-")[0];
    const langs = [];
    for (const t of preferredTracks || []) {
      const l = String(t?.languageCode || "").trim();
      if (l && !langs.includes(l)) langs.push(l);
    }
    if (target && !langs.includes(target)) langs.push(target);
    if (!langs.includes("en")) langs.push("en");

    const url = "https://one-click-dub-fast-server.onrender.com/api/youtube/transcript";
    const youtubeCookie = await getYoutubeCookieStringForLocalServer();
    const res = await fetch(url, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, langs, youtubeCookie })
    });
    const text = await res.text();
    if (!res.ok) throw new Error("transcript HTTP " + res.status + ": " + text.slice(0, 220));
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("transcript returned non-JSON: " + text.slice(0, 180)); }
    if (!data?.ok || !Array.isArray(data.captions)) throw new Error(data?.error || "transcript returned no captions");
    return data.captions.map((c, index) => ({
      index,
      start: Number(c.start || 0),
      end: Number(c.end || (Number(c.start || 0) + Number(c.dur || 1.6))),
      text: String(c.text || "").replace(/\s+/g, " ").trim(),
      processPunctuation: true
    })).filter(c => c.text && c.end > c.start);
  }

  function orderCaptionTracks(tracks) {
    const target = normalizeTargetLanguage(settings.targetLanguage || settings.dubbingLanguage || "en").split("-")[0].toLowerCase();
    const score = t => {
      const lang = String(t.languageCode || "").toLowerCase();
      const kind = String(t.kind || "").toLowerCase();
      let n = 0;
      if (!kind.includes("asr")) n += 30;
      if (lang === target) n += 25;
      if (lang.startsWith(target)) n += 20;
      if (lang === "en" || lang.startsWith("en")) n += 10;
      if (readTrackName(t).toLowerCase().includes("english")) n += 5;
      return -n;
    };
    return [...tracks].sort((a, b) => score(a) - score(b));
  }

  function readTrackName(track) {
    const sr = track?.name?.simpleText || track?.name?.runs?.map(r => r.text || "").join("") || track?.vssId || track?.languageCode || "caption";
    return String(sr);
  }

  function buildCaptionUrlVariants(baseUrl, track) {
    const out = [];
    const add = u => { if (u && !out.includes(u)) out.push(u); };
    let clean = decodeCaptionUrl(baseUrl);
    if (!clean) return out;
    const withFmt = (fmt) => {
      try {
        const u = new URL(clean);
        u.searchParams.set("fmt", fmt);
        return u.toString();
      } catch {
        const noFmt = clean.replace(/([?&])fmt=[^&]*/g, "$1").replace(/[?&]$/, "");
        return noFmt + (noFmt.includes("?") ? "&" : "?") + "fmt=" + encodeURIComponent(fmt);
      }
    };
    add(withFmt("json3"));
    add(withFmt("srv3"));
    add(withFmt("ttml"));
    add(withFmt("srv1"));
    add(clean);

    const videoId = currentVideoId();
    const lang = track?.languageCode || "en";
    if (videoId && lang) {
      for (const fmt of ["json3", "srv3", "ttml", "srv1"]) {
        const direct = new URL("https://www.youtube.com/api/timedtext");
        direct.searchParams.set("v", videoId);
        direct.searchParams.set("lang", lang);
        direct.searchParams.set("fmt", fmt);
        if (track?.kind) direct.searchParams.set("kind", track.kind);
        add(direct.toString());
      }
    }
    return out;
  }

  function decodeCaptionUrl(url) {
    return String(url || "")
      .replace(/\u0026/g, "&")
      .replace(/&amp;/g, "&")
      .replace(/\\//g, "/")
      .trim();
  }

  function currentVideoId() {
    try {
      return new URL(location.href).searchParams.get("v") || location.pathname.match(/\/shorts\/([^/?#]+)/)?.[1] || "";
    } catch { return ""; }
  }


  function installPageCaptionCapture() {
    if (pageCaptureInstalled) return;
    pageCaptureInstalled = true;
    window.addEventListener("message", event => {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.source !== "OCD_PAGE_CAPTION_CAPTURE") return;
      if (data.type === "caption-body" && data.body) {
        const captions = parseCaptionText(String(data.body || ""));
        if (captions.length) {
          const key = currentVideoId() + "|" + String(data.url || "unknown").slice(0, 180);
          capturedCaptionBuckets.set(key, captions);
          console.info("[OCD] captured caption network body", captions.length, data.url || "");
        }
      }
    });
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("ocd-page-capture.js");
      script.async = false;
      script.onload = () => script.remove();
      script.onerror = () => console.warn("[OCD] failed to inject page caption capture script");
      (document.documentElement || document.head || document.body).appendChild(script);
      console.info("[OCD] page caption capture injected");
    } catch (error) {
      console.warn("[OCD] could not inject page caption capture script", error);
    }
  }

  async function waitForCapturedCaptionNetwork(preferredTracks) {
    const already = bestCapturedCaptionBucket();
    if (already.length) return already;
    console.info("[OCD] waiting for page caption network capture; turn on YouTube CC if needed");
    const started = Date.now();
    return await new Promise(resolve => {
      const timer = setInterval(() => {
        const found = bestCapturedCaptionBucket();
        if (found.length || Date.now() - started > CAPTION_CAPTURE_WAIT_MS) {
          clearInterval(timer);
          resolve(found);
        }
      }, 350);
    });
  }

  function bestCapturedCaptionBucket() {
    let best = [];
    const vid = currentVideoId();
    for (const [key, captions] of capturedCaptionBuckets.entries()) {
      if (vid && !key.startsWith(vid + "|")) continue;
      if (Array.isArray(captions) && captions.length > best.length) best = captions;
    }
    return best.map((c, index) => ({ ...c, index }));
  }


  async function getYoutubeCookieStringForLocalServer() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "OCD_GET_YOUTUBE_COOKIES" });
      if (response?.ok && response.cookieString) return response.cookieString;
    } catch (error) {
      console.warn("[OCD] could not read YouTube cookies for local server", error);
    }
    return "";
  }

  async function fetchAndParseCaptionUrl(url) {
    const attempts = [];
    const youtubeCookie = await getYoutubeCookieStringForLocalServer();
    const localUrl = "https://one-click-dub-fast-server.onrender.com/api/youtube/captions?url=" + encodeURIComponent(url);
    attempts.push({
      label: "local-proxy-cookie",
      url: localUrl,
      options: {
        credentials: "omit",
        headers: youtubeCookie ? { "X-YouTube-Cookie": youtubeCookie } : {}
      }
    });
    attempts.push({ label: "direct", url, options: { credentials: "include" } });

    const errors = [];
    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt.url, attempt.options);
        const text = await res.text();
        if (!res.ok) throw new Error(attempt.label + " HTTP " + res.status + ": " + text.slice(0, 180));
        const captions = parseCaptionText(text);
        if (captions.length) {
          console.info("[OCD] caption parsed via", attempt.label, captions.length);
          return captions;
        }
        errors.push(attempt.label + " empty/unparsable len=" + text.length + " preview=" + text.slice(0, 100));
      } catch (error) {
        errors.push(attempt.label + " " + (error?.message || error));
      }
    }
    throw new Error(errors.join(" | "));
  }

  function parseCaptionText(text) {
    if (!String(text || "").trim()) return [];
    const trimmed = String(text).trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return parseJson3Captions(JSON.parse(trimmed)); } catch (error) { console.warn("[OCD] JSON caption parse failed", error, trimmed.slice(0, 140)); }
    }
    const xmlCaptions = parseXmlCaptions(trimmed);
    if (xmlCaptions.length) return xmlCaptions;
    return [];
  }

  async function findCaptionTracks() {
    const result = [];
    const seen = new Set();
    function addTracks(tracks) {
      if (!Array.isArray(tracks)) return;
      for (const t of tracks) {
        if (!t?.baseUrl || seen.has(t.baseUrl)) continue;
        seen.add(t.baseUrl);
        result.push(t);
      }
    }

    // 1) Ask the page world directly. Content scripts run in an isolated world,
    // so window.ytInitialPlayerResponse is often invisible unless we bridge it.
    try { addTracks(await readCaptionTracksFromPageWorld()); } catch (error) { console.warn("[OCD] page-world captions failed", error); }

    // 2) Parse inline scripts already present in the DOM.
    try { addTracks(readCaptionTracksFromScripts()); } catch (error) { console.warn("[OCD] script captions failed", error); }

    // 3) Fetch the current watch HTML and parse ytInitialPlayerResponse from it.
    // This catches SPA navigations where script text in the DOM is stale.
    try { addTracks(await readCaptionTracksFromWatchHtml()); } catch (error) { console.warn("[OCD] watch-html captions failed", error); }

    return result;
  }

  function readCaptionTracksFromPageWorld() {
    // YouTube blocks inline script injection via CSP on many accounts/pages.
    // The extension now relies on DOM script parsing + watch HTML parsing instead.
    return Promise.resolve([]);
  }

  function readCaptionTracksFromScripts() {
    const out = [];
    const addFromObject = obj => {
      const tracks = obj?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks)) out.push(...tracks);
    };
    for (const script of document.scripts) {
      const txt = script.textContent || "";
      if (!txt.includes("captionTracks")) continue;
      const json = extractJsonAfter(txt, "ytInitialPlayerResponse");
      if (json) { try { addFromObject(JSON.parse(json)); } catch {} }
      const arr = extractArrayAfterKey(txt, "captionTracks");
      if (arr) { try { out.push(...JSON.parse(arr.replace(/\\u0026/g, "&"))); } catch {} }
    }
    return out;
  }

  async function readCaptionTracksFromWatchHtml() {
    const videoId = new URL(location.href).searchParams.get("v") || location.pathname.match(/\/shorts\/([^/?#]+)/)?.[1];
    if (!videoId) return [];
    const htmlUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en&persist_hl=1`;
    const res = await fetch(htmlUrl, { credentials: "include" });
    if (!res.ok) return [];
    const txt = await res.text();
    const json = extractJsonAfter(txt, "ytInitialPlayerResponse");
    if (json) {
      try { return JSON.parse(json)?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []; } catch {}
    }
    const arr = extractArrayAfterKey(txt, "captionTracks");
    if (arr) { try { return JSON.parse(arr.replace(/\\u0026/g, "&")); } catch {} }
    return [];
  }

  function extractJsonAfter(text, varName) {
    const idx = text.indexOf(varName);
    if (idx < 0) return "";
    const eq = text.indexOf("=", idx);
    if (eq < 0) return "";
    const start = text.indexOf("{", eq);
    if (start < 0) return "";
    return extractBalanced(text, start, "{", "}");
  }

  function extractArrayAfterKey(text, key) {
    const keyIdx = text.indexOf(`"${key}"`);
    if (keyIdx < 0) return "";
    const colon = text.indexOf(":", keyIdx);
    if (colon < 0) return "";
    const start = text.indexOf("[", colon);
    if (start < 0) return "";
    return extractBalanced(text, start, "[", "]");
  }

  function extractBalanced(text, start, open, close) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === open) depth++;
        else if (ch === close) {
          depth--;
          if (depth === 0) return text.slice(start, i + 1);
        }
      }
    }
    return "";
  }

  function parseJson3Captions(data) {
    const out = [];
    for (const ev of data?.events || []) {
      if (!ev.segs || typeof ev.tStartMs !== "number") continue;
      const text = ev.segs.map(s => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const start = ev.tStartMs / 1000;
      const dur = Math.max(0.6, (ev.dDurationMs || 1600) / 1000);
      out.push({ index: out.length, start, end: start + dur, text, processPunctuation: true });
    }
    return mergeTinyCaptions(out.filter(c => c.text && c.end > c.start));
  }

  function parseXmlCaptions(xmlText) {
    try {
      const doc = new DOMParser().parseFromString(xmlText, "text/xml");
      let nodes = [...doc.querySelectorAll("text")];
      let out = nodes.map((node, index) => {
        const start = Number(node.getAttribute("start") || 0);
        const dur = Math.max(0.6, Number(node.getAttribute("dur") || 1.6));
        const decoded = node.textContent || "";
        return { index, start, end: start + dur, text: decoded.replace(/\s+/g, " ").trim(), processPunctuation: true };
      }).filter(c => c.text && c.end > c.start);
      if (!out.length) {
        nodes = [...doc.querySelectorAll("p")];
        out = nodes.map((node, index) => {
          const startMs = Number(node.getAttribute("t") || 0);
          const durMs = Math.max(600, Number(node.getAttribute("d") || 1600));
          const decoded = node.textContent || "";
          return { index, start: startMs / 1000, end: (startMs + durMs) / 1000, text: decoded.replace(/\s+/g, " ").trim(), processPunctuation: true };
        }).filter(c => c.text && c.end > c.start);
      }
      return mergeTinyCaptions(out);
    } catch {
      return [];
    }
  }

  function mergeTinyCaptions(items) {
    const merged = [];
    for (const item of items) {
      const last = merged[merged.length - 1];
      if (last && item.start - last.end < 0.25 && (last.text + " " + item.text).length < 110 && last.end - last.start < 1.8) {
        last.text = `${last.text} ${item.text}`.replace(/\s+/g, " ").trim();
        last.end = item.end;
      } else {
        merged.push({ ...item, index: merged.length });
      }
    }
    return merged.map((c, index) => ({ ...c, index }));
  }


  window.addEventListener("error", event => {
    const msg = event?.error?.stack || event?.message || "unknown script error";
    if (String(msg).includes("g is not defined")) {
      try { globalThis.g = globalThis; } catch {}
    }
    console.error("[OCD] window error", msg);
  });

  window.addEventListener("unhandledrejection", event => {
    const reason = event?.reason;
    console.error("[OCD] unhandled rejection", reason?.stack || reason?.message || reason);
  });

  chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    mount();
    if (message.type === "OCD_PING") { sendResponse({ ok: true }); return true; }
    if (message.type === "OCD_VIDEO_STATUS") { sendResponse({ hasVideo: !!mainVideo(), dubbing: !!dub }); return true; }
    if (message.type === "OCD_SETTINGS_CHANGED") saveSettings({ ...(message.payload || {}) });
    if (message.type === "OCD_SET_QUICK_BUTTONS") saveSettings({ quickButtons: !!message.payload?.enabled });
    if (message.type === "OCD_TOGGLE_DUB") toggleDub();
  });

  loadSettings().then(() => { mount(); applySettings(); });
})();
