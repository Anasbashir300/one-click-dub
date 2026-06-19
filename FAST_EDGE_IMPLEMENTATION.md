# Fast Edge TTS implementation

The `fast` model now follows this local pipeline:

1. Content script finds the active video.
2. It extracts YouTube caption tracks from `ytInitialPlayerResponse` / page scripts.
3. It fetches captions as `fmt=json3` and normalizes them into `{start,end,text}` cues.
4. It processes three upcoming cues at a time.
5. Background service worker translates each cue with Google Translate public endpoint.
6. Background service worker requests an Edge TTS token and posts SSML to Microsoft Speech TTS.
7. It returns MP3 audio as base64 to the content script.
8. Content script converts MP3 to Blob URL, shows styled captions, plays audio over the video, and lowers the original video volume according to settings.

Files changed:

- `manifest.json`: added MV3 background service worker and host permissions.
- `background.js`: new translation + Edge TTS worker.
- `content.js`: replaced demo dubbing with real fast dubbing pipeline.
- `popup.js`: changed Fast voice selector/samples from Piper to Edge TTS voices.
- `README.md`: updated install/use notes.

Limitations:

- Requires YouTube videos with existing captions.
- Does not perform speech recognition for videos without captions.
- Uses unofficial Edge TTS endpoint behavior; may rate-limit or change.
- Prototype sync only: it overlays TTS audio but does not remove original speech from the video.
