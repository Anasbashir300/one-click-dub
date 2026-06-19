# One Click Dub - Custom Backend

This build removes the pyVideoTrans dependency from the active dubbing path.

The YouTube `🎬 Dub` button now calls a custom Colab backend:

`yt-dlp -> ffmpeg -> faster-whisper -> Smart Chunking -> Google Translate endpoint -> Edge TTS -> final MP4`

Use `CUSTOM_BACKEND_COLAB_STEPS.md` for setup.

## Punctuation audio pauses

This build includes explicit audio-timeline pauses for punctuation. Enable with:

```python
env["OCD_TTS_PUNCT_PAUSES"] = "1"
```

Tune with `OCD_TTS_PAUSE_SENTENCE`, `OCD_TTS_PAUSE_COMMA`, and `OCD_TTS_PAUSE_ON_COMMA`.


## Punctuation speed fix
This build uses a Transformers-v5-compatible direct FullStop punctuation pipeline and disables repeated retries after first failure. See PUNCTUATION_SPEED_FIX_AR.md.
