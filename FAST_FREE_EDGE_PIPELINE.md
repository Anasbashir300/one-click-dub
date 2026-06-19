# Fast Free Edge TTS Pipeline

This build implements the free Fast path only.

Flow:

1. The content script detects the active YouTube video.
2. It extracts `captionTracks` from YouTube player metadata.
3. It loads the selected caption track as `json3` and normalizes each event to `{ index, start, end, text }`.
4. It creates a hidden `TextTrack` named `one-click-dub-fast-free`.
5. It adds one `VTTCue` per subtitle and attaches `enter` / `exit` listeners.
6. A streaming queue prepares only 3 subtitles per batch.
7. The background service worker translates each caption through Google Translate.
8. The background service worker sends SSML to Microsoft Edge TTS and returns MP3 as base64.
9. The content script converts MP3 base64 to Blob URLs and caches them by caption index.
10. When a cue enters, the matching audio is played over the YouTube video, the translated caption is shown, and the original video volume is lowered/muted/left normal according to settings.
11. If playback reaches a cue before audio is ready, the video is paused briefly and resumes after the batch is ready.
12. Seeking or pausing stops active generated audio and recalculates the queue cursor.

No paid backend is used in this build. Videos without existing YouTube captions are not supported by the free Fast path.
