# One Click Dub - Fast Local Server Mode

This build moves the free Fast model processing to a local Node.js server.

Pipeline:

YouTube captions → extension content script → local server `http://localhost:3000` → Google Translate → Microsoft Edge TTS → MP3 base64 → extension playback using TextTrack/VTTCue.

## Start server

```bash
cd local-fast-server
npm install
npm start
```

Then load `extension/one_click_dub_complete_product_ui_v2` in Chrome using `chrome://extensions` → Developer mode → Load unpacked.

## Important

The server uses unofficial/free endpoints for Google Translate and Microsoft Edge TTS. They may rate limit or stop working.
