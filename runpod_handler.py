"""RunPod Serverless entrypoint for One Click Dub.

Receives RunPod jobs with input payload equal to the old /api/custom/dub body.
Returns the final dubbed MP3 as base64 so the Chrome extension can play it as a Blob.
"""
import os
import time
import uuid
import base64
from pathlib import Path
from typing import Any, Dict

# Serverless defaults must be set before importing the backend module.
os.environ.setdefault("OCD_ROOT", "/runpod-volume/one-click-dub")
os.environ.setdefault("OCD_SERVERLESS_OUTPUT_BASE64", "1")
os.environ.setdefault("PUBLIC_BASE_URL", "")
os.environ.setdefault("OCD_DELETE_JOB_TEMP_AFTER_DONE", "1")
os.environ.setdefault("OCD_JOB_TEMP_TTL_SEC", "600")
os.environ.setdefault("OCD_DELETE_JOB_TEMP_AFTER_ERROR", "1")
os.environ.setdefault("OCD_JOB_ERROR_TEMP_TTL_SEC", "1800")
os.environ.setdefault("OCD_DELETE_OUTPUT_AFTER_TTL", "1")
os.environ.setdefault("OCD_OUTPUT_TTL_SEC", "21600")

# Model defaults for RTX 3090 serverless.
os.environ.setdefault("OCD_FAST_WHISPER_MODEL", "large")
os.environ.setdefault("OCD_QUALITY_WHISPER_MODEL", "medium")
os.environ.setdefault("OCD_PRO_WHISPER_MODEL", "turbo")
os.environ.setdefault("OCD_WHISPER_COMPUTE_TYPE", "float16")
os.environ.setdefault("OCD_NLLB_MODEL", "facebook/nllb-200-distilled-600M")
os.environ.setdefault("OCD_NLLB_DTYPE", "float16")
os.environ.setdefault("OCD_NLLB_BEAMS", "2")
os.environ.setdefault("OCD_OMNIVOICE_AUTO_CLONE", "1")
os.environ.setdefault("OCD_FISH_AUTO_CLONE", "1")
os.environ.setdefault("OCD_FISH_MODEL", "s2-pro")
os.environ.setdefault("OCD_FISH_TTS_MODE", "local-http")
os.environ.setdefault("OCD_FISH_LOCAL_URL", "http://127.0.0.1:8080/v1/tts")
os.environ.setdefault("OCD_AUTOSTART_FISH_ON_PRO", "1")
os.environ.setdefault("OCD_FISH_STARTUP_TIMEOUT_SEC", "900")
os.environ.setdefault("OCD_USE_PUNCTUATION", "1")
os.environ.setdefault("OCD_TTS_PUNCT_PAUSES", "1")
os.environ.setdefault("OCD_YTDLP_REMOTE_EJS", "1")
os.environ.setdefault("OCD_YTDLP_REMOTE_COMPONENTS", "ejs:github")

import runpod  # noqa: E402
from colab_custom_dub_server import DubRequest, jobs, process_job, health, is_fish_server_ready, _fish_health_url  # noqa: E402


def _read_audio_b64(path: str) -> Dict[str, Any]:
    p = Path(path)
    if not p.exists() or not p.is_file():
        raise FileNotFoundError(f"output audio file not found: {path}")
    data = p.read_bytes()
    if len(data) < 1024:
        raise RuntimeError(f"output audio file is too small: {len(data)} bytes")
    return {
        "audioBase64": base64.b64encode(data).decode("ascii"),
        "mimeType": "audio/mpeg",
        "audioBytes": len(data),
        "filename": p.name,
    }


def handler(event: Dict[str, Any]) -> Dict[str, Any]:
    payload = event.get("input") or {}
    if not isinstance(payload, dict):
        return {"ok": False, "status": "error", "error": "RunPod input must be a JSON object"}

    # Health check job: send {"health": true} as input.
    if payload.get("health") is True:
        h = health()
        h["serverless"] = True
        h["fish"] = {"mode": "local-http-only-autostart", "localUrl": os.environ.get("OCD_FISH_LOCAL_URL"), "healthUrl": _fish_health_url(), "ready": is_fish_server_ready(timeout=1.0)}
        return h

    try:
        req = DubRequest(**payload)
    except Exception as e:
        return {"ok": False, "status": "error", "error": f"Invalid request payload: {e}"}

    if not str(req.url or "").startswith("https://"):
        return {"ok": False, "status": "error", "error": "Only https video URLs are allowed"}

    job_id = uuid.uuid4().hex[:12]
    jobs[job_id] = {
        "ok": True,
        "jobId": job_id,
        "status": "queued",
        "progress": 0,
        "message": "Queued inside RunPod Serverless worker",
        "createdAt": time.time(),
        "service": "runpod-serverless",
    }

    process_job(job_id, req)
    job = jobs.get(job_id, {})
    if job.get("status") == "error":
        return {
            "ok": False,
            "jobId": job_id,
            "status": "error",
            "progress": 100,
            "message": job.get("message") or job.get("error") or "Job failed",
            "error": job.get("error") or job.get("message") or "Job failed",
            "service": "runpod-serverless",
            "modelName": job.get("modelName"),
            "ttsBackend": job.get("ttsBackend"),
        }

    output_file = job.get("outputFile")
    try:
        audio = _read_audio_b64(output_file)
    except Exception as e:
        return {"ok": False, "jobId": job_id, "status": "error", "error": str(e), "service": "runpod-serverless"}

    return {
        "ok": True,
        "jobId": job_id,
        "status": "done",
        "progress": 100,
        "message": "Done · RunPod Serverless returned MP3 base64",
        "outputKind": "audio-base64",
        "service": "runpod-serverless",
        "modelName": job.get("modelName"),
        "whisperModel": job.get("whisperModel"),
        "asrEngine": job.get("asrEngine"),
        "translationEngine": job.get("translationEngine"),
        "ttsBackend": job.get("ttsBackend"),
        "voiceName": job.get("voiceName"),
        "voiceClone": job.get("voiceClone"),
        "fishModel": job.get("fishModel"),
        **audio,
    }


runpod.serverless.start({"handler": handler})
