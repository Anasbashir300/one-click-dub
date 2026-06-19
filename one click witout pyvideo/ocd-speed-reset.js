(() => {
  // One Click Dub safety guard.
  // Some experimental speed patches or YouTube persisted settings may restore an invalid
  // playbackRate such as 0.3 on each navigation. During page load we normalize only
  // abnormally-low rates, without touching normal choices like 0.75x, 1x, 1.25x, 2x.
  if (window.__ocdSpeedResetInstalled) return;
  window.__ocdSpeedResetInstalled = true;

  const MIN_ALLOWED_START_RATE = 0.5;
  const DEFAULT_RATE = 1;

  function fixVideoRate(reason = "scan") {
    for (const video of document.querySelectorAll("video")) {
      try {
        const rate = Number(video.playbackRate || 1);
        if (rate > 0 && rate < MIN_ALLOWED_START_RATE) {
          video.playbackRate = DEFAULT_RATE;
          video.defaultPlaybackRate = DEFAULT_RATE;
          console.info("[OCD] reset abnormal YouTube playback rate", { reason, from: rate, to: DEFAULT_RATE });
        }
      } catch {}
    }
  }

  function installOnVideo(video) {
    if (!video || video.__ocdSpeedResetBound) return;
    video.__ocdSpeedResetBound = true;
    try {
      video.addEventListener("ratechange", () => fixVideoRate("ratechange"), { passive: true });
      video.addEventListener("loadedmetadata", () => fixVideoRate("loadedmetadata"), { passive: true });
    } catch {}
    fixVideoRate("video-found");
  }

  function scan() {
    document.querySelectorAll("video").forEach(installOnVideo);
    fixVideoRate("scan");
  }

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement || document, { childList: true, subtree: true });

  // YouTube is an SPA and may set the rate after initial scripts run.
  let ticks = 0;
  const timer = setInterval(() => {
    scan();
    if (++ticks > 80) clearInterval(timer);
  }, 250);
})();
