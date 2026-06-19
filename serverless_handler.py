"""
One Click Dub - RunPod Serverless worker handler

This wraps the existing One Click Dub pipeline in a RunPod Serverless handler.
It is intended for Queue-based RunPod Serverless endpoints.

Input example:
{
  "input": {
    "url": "https://www.youtube.com/watch?v=...",
    "sourceLanguage": "auto",
    "targetLanguage": "ar",
    "voiceName": "auto-clone-video",
    "modelName": "quality",
    "ttsType": 2,
    "translationEngine": "nllb200",
    "cuda": true
  }
}

Output:
{
  "ok": true,
  "jobId": "...",
  "status": "done",
  "audioMime": "audio/mpeg",
  "audioBase64": "...",
  "filename": "..._dubbed_audio.mp3",
  "meta": {...}
}
"""

import os
import time
import uuid
import base64
import traceback
from pathlib import Path
from typing import Dict, Any

# Serverless workers usually mount persistent volume at /runpod-volume.
# These env values MUST be set before importing the FastAPI backend module.
DEFAULT_ROOT = "/runpod-volume/one-click-dub" if Path("/runpod-volume").exists() else "/tmp/one-click-dub"
os.environ.setdefault("OCD_ROOT", DEFAULT_ROOT)
os.environ.setdefault("OCD_JOBS_DIR", str(Path(os.environ["OCD_ROOT"]) / "jobs"))
os.environ.setdefault("OCD_OUTPUTS_DIR", str(Path(os.environ["OCD_ROOT"]) / "outputs"))
os.environ.setdefault("HF_HOME", "/runpod-volume/.cache/huggingface" if Path("/runpod-volume").exists() else "/tmp/.cache/huggingface")
os.environ.setdefault("TRANSFORMERS_CACHE", os.environ["HF_HOME"])
os.environ.setdefault("XDG_CACHE_HOME", "/runpod-volume/.cache" if Path("/runpod-volume").exists() else "/tmp/.cache")

# PUBLIC_BASE_URL is required by the original FastAPI pipeline before it marks a job done.
# In Serverless we return base64 directly, so this URL is only a harmless placeholder.
os.environ.setdefault("PUBLIC_BASE_URL", "serverless://one-click-dub")

# Safe serverless defaults.
os.environ.setdefault("OCD_RUNPOD_SERVERLESS", "1")
os.environ.setdefault("OCD_RUNPOD_MODE", "serverless")
os.environ.setdefault("OCD_MAX_GPU_JOBS", "1")
os.environ.setdefault("OCD_MAX_FAST_JOBS", "1")
os.environ.setdefault("OCD_FAST_ASR_ENGINE", "faster-whisper")
os.environ.setdefault("OCD_FAST_WHISPER_MODEL", "large-v3-turbo")
os.environ.setdefault("OCD_QUALITY_WHISPER_MODEL", "large-v3")
os.environ.setdefault("OCD_WHISPER_COMPUTE_TYPE", "float16")
os.environ.setdefault("OCD_NLLB_MODEL", "facebook/nllb-200-distilled-600M")
os.environ.setdefault("OCD_NLLB_DTYPE", "float16")
os.environ.setdefault("OCD_NLLB_BEAMS", "2")
os.environ.setdefault("OCD_OMNIVOICE_AUTO_CLONE", "1")
os.environ.setdefault("OCD_OMNIVOICE_STEPS", "24")
os.environ.setdefault("OCD_OMNIVOICE_GUIDANCE", "2.0")
os.environ.setdefault("OCD_OMNIVOICE_TTS_MAX_CHARS", "190")
os.environ.setdefault("OCD_USE_PUNCTUATION", "1")
os.environ.setdefault("OCD_TTS_PUNCT_PAUSES", "1")
os.environ.setdefault("OCD_USE_CATT_TASHKEEL", "1")
os.environ.setdefault("OCD_DELETE_JOB_TEMP_AFTER_DONE", "1")
os.environ.setdefault("OCD_JOB_TEMP_TTL_SEC", "600")
os.environ.setdefault("OCD_DELETE_JOB_TEMP_AFTER_ERROR", "1")
os.environ.setdefault("OCD_JOB_ERROR_TEMP_TTL_SEC", "1800")
os.environ.setdefault("OCD_DELETE_OUTPUT_AFTER_TTL", "1")
os.environ.setdefault("OCD_OUTPUT_TTL_SEC", "21600")
os.environ.setdefault("OCD_YTDLP_REMOTE_EJS", "1")
os.environ.setdefault("OCD_YTDLP_USE_REQUEST_COOKIES", "0")

Path(os.environ["OCD_JOBS_DIR"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["OCD_OUTPUTS_DIR"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["HF_HOME"]).mkdir(parents=True, exist_ok=True)

# Import the existing pipeline after env setup.
import colab_custom_dub_server as backend  # noqa: E402


def _clean_input(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(payload or {})
    data.setdefault("url", "")
    data.setdefault("sourceLanguage", "auto")
    data.setdefault("targetLanguage", "ar")
    data.setdefault("voiceName", "auto-clone-video")
    data.setdefault("modelName", "quality")
    data.setdefault("ttsType", 2 if str(data.get("modelName", "quality")).lower() in ("quality", "omnivoice", "thinker") else 0)
    data.setdefault("translationEngine", "nllb200" if str(data.get("modelName", "quality")).lower() in ("quality", "omnivoice", "thinker") else "google")
    data.setdefault("cuda", True)
    # Never trust browser cookies in a public serverless endpoint by default.
    if os.environ.get("OCD_ACCEPT_BROWSER_COOKIES", "0") != "1":
        data["cookieString"] = ""
    return data


def _read_audio_base64(path: str) -> Dict[str, Any]:
    p = Path(path)
    if not p.exists() or not p.is_file() or p.stat().st_size < 1024:
        raise RuntimeError(f"Output MP3 not found or too small: {p}")
    raw = p.read_bytes()
    return {
        "filename": p.name,
        "audioMime": "audio/mpeg",
        "audioBytes": len(raw),
        "audioBase64": base64.b64encode(raw).decode("ascii"),
    }


def handler(event: Dict[str, Any]) -> Dict[str, Any]:
    started = time.time()
    try:
        payload = _clean_input((event or {}).get("input") or {})
        action = str(payload.get("action", "dub")).lower().strip()

        if action in ("health", "warmup"):
            h = backend.health()
            h["serverless"] = True
            h["handler"] = "one-click-dub-serverless"
            h["warm"] = action == "warmup"
            return {"ok": True, "health": h}

        if not str(payload.get("url", "")).startswith("https://"):
            return {"ok": False, "error": "Only https video/page URLs are allowed"}

        req = backend.DubRequest(**payload)
        job_id = uuid.uuid4().hex[:12]
        backend.jobs[job_id] = {
            "ok": True,
            "jobId": job_id,
            "status": "queued",
            "progress": 0,
            "message": "Queued in RunPod Serverless worker",
            "createdAt": started,
            "service": "runpod-serverless-worker",
        }

        # Synchronous processing inside the worker. RunPod's /run endpoint remains async outside.
        backend.process_job(job_id, req)
        job = backend.jobs.get(job_id, {})
        if job.get("status") != "done":
            return {
                "ok": False,
                "jobId": job_id,
                "status": job.get("status", "error"),
                "error": job.get("error") or job.get("message") or "Dub job did not complete",
                "message": job.get("message", ""),
                "elapsedSec": round(time.time() - started, 2),
                "meta": job,
            }

        audio = _read_audio_base64(job.get("outputFile", ""))
        # Keep output concise but include useful metadata.
        return {
            "ok": True,
            "jobId": job_id,
            "status": "done",
            "elapsedSec": round(time.time() - started, 2),
            **audio,
            "meta": {
                "modelName": job.get("modelName"),
                "whisperModel": job.get("whisperModel"),
                "translationEngine": job.get("translationEngine"),
                "ttsBackend": job.get("ttsBackend"),
                "voiceClone": job.get("voiceClone"),
                "rawSegments": job.get("rawSegments"),
                "ttsChunks": job.get("ttsChunks"),
                "outputKind": "audio",
            },
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": "error",
            "error": str(exc),
            "traceback": traceback.format_exc()[-4000:],
            "elapsedSec": round(time.time() - started, 2),
        }


if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})
