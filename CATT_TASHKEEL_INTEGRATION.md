# CATT Arabic Tashkeel Integration

This build adds optional Arabic diacritization before TTS.

Pipeline:

```text
Translate to Arabic
↓
CATT Tashkeel / Arabic diacritization
↓
Edge TTS
↓
Audio overlay
```

## Colab install

Run this before starting the server:

```python
!python -m pip install -U catt-tashkeel
```

If you have not installed the rest of the backend requirements yet:

```python
!apt-get update -y
!apt-get install -y ffmpeg git curl
!python -m pip install -U pip wheel packaging
!python -m pip install -U fastapi uvicorn python-multipart pydantic requests yt-dlp edge-tts faster-whisper numpy catt-tashkeel
```

## Environment variables

Default:

```python
env["OCD_USE_CATT_TASHKEEL"] = "1"
env["OCD_CATT_MODEL"] = "eo"
```

`eo` = faster.

`ed` = more accurate but slower.

Recommended for dubbing:

```python
env["OCD_CATT_MODEL"] = "eo"
```

## Where it runs

CATT runs only when the target language starts with `ar`.

The server writes a debug file for the diacritized text:

```text
/content/ocd_custom_jobs/<job_id>/tashkeel_chunks.srt
```

## Disable if needed

```python
env["OCD_USE_CATT_TASHKEEL"] = "0"
```
