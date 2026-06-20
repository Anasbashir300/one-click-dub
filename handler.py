"""RunPod Serverless entry point for One Click Dub.

Latest wrapper updates:
- supports only fast / quality / pro
- routes model defaults into job["input"]
- enforces CATT tashkeel flags for all models
- keeps numbers/punctuation preservation flags enabled
- avoids exposing RunPod internals to the extension

Important:
The real dubbing pipeline still lives in serverless_handler.py.
This wrapper prepares and validates the job before passing it to
serverless_handler.handler.
"""

from __future__ import annotations

import copy
import os
from typing import Any, Dict

import runpod
from serverless_handler import handler as _serverless_handler


ALLOWED_MODELS = {"fast", "quality", "pro"}

MODEL_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "fast": {
        "ttsEngine": "edge",
        "tts_engine": "edge",
        "translationEngine": "google",
        "translation_engine": "google",
        "autoClone": False,
        "useOmniVoice": False,
        "useFishSpeech": False,
        "audioBitrate": "128k",
        "chunkMaxChars": 450,
        "chunkMinChars": 180,
    },
    "quality": {
        "ttsEngine": "omnivoice",
        "tts_engine": "omnivoice",
        "translationEngine": "nllb",
        "translation_engine": "nllb",
        "autoClone": True,
        "useOmniVoice": True,
        "useFishSpeech": False,
        "audioBitrate": "192k",
        "chunkMaxChars": 380,
        "chunkMinChars": 160,
    },
    "pro": {
        "ttsEngine": "fish_speech",
        "tts_engine": "fish_speech",
        "translationEngine": "nllb",
        "translation_engine": "nllb",
        "autoClone": True,
        "useOmniVoice": False,
        "useFishSpeech": True,
        "audioBitrate": "256k",
        "chunkMaxChars": 320,
        "chunkMinChars": 120,
    },
}


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _normalize_model(value: Any) -> str:
    raw = str(value or "").strip().lower()

    if raw in ("fast", "speed", "quick"):
        return "fast"
    if raw in ("quality", "omni", "omnivoice"):
        return "quality"
    if raw in ("pro", "fish", "fish_speech", "fish-speech"):
        return "pro"

    env_model = _env("OCD_MODEL") or _env("OCD_ENDPOINT_MODEL") or "fast"
    env_model = env_model.lower()

    if env_model in ALLOWED_MODELS:
        return env_model

    return "fast"


def _set_common_env_defaults() -> None:
    """Set safe defaults if the endpoint has not defined them."""

    # Every model should use Arabic tashkeel when target language is Arabic.
    os.environ.setdefault("OCD_USE_CATT_TASHKEEL", "1")

    # Required so CATT wrapper keeps digits, dates, percentages, currency,
    # English text, links, and punctuation marks instead of deleting them.
    os.environ.setdefault("OCD_CATT_PRESERVE_SYMBOLS", "1")
    os.environ.setdefault("OCD_SAFE_TASHKEEL", "1")

    # Keep punctuation pauses for TTS naturalness.
    os.environ.setdefault("OCD_USE_PUNCTUATION", "1")
    os.environ.setdefault("OCD_TTS_PUNCT_PAUSES", "1")

    # Extension expects audioBase64 unless serverless_handler returns audioUrl.
    os.environ.setdefault("OCD_RETURN_AUDIO_BASE64", "1")
    os.environ.setdefault("OCD_OUTPUT_FORMAT", "mp3")

    # YouTube / yt-dlp safety defaults used in the previous debugging path.
    os.environ.setdefault("OCD_YTDLP_REMOTE_EJS", "1")
    os.environ.setdefault("OCD_YTDLP_USE_REQUEST_COOKIES", "0")

    # Cleanup defaults.
    os.environ.setdefault("OCD_JOB_TEMP_TTL_SEC", "600")
    os.environ.setdefault("OCD_OUTPUT_TTL_SEC", "21600")
    os.environ.setdefault("OCD_JOB_ERROR_TEMP_TTL_SEC", "1800")


def _prepare_job(job: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize model/input before calling the real serverless handler."""

    _set_common_env_defaults()

    prepared = copy.deepcopy(job or {})
    job_input = prepared.get("input") or {}
    if not isinstance(job_input, dict):
        job_input = {}

    model = _normalize_model(job_input.get("model"))
    defaults = MODEL_DEFAULTS[model]

    job_input["model"] = model
    job_input["ocdModel"] = model

    # Apply only missing fields so the extension can override intentionally.
    for key, value in defaults.items():
        job_input.setdefault(key, value)

    # Latest required behavior: all models use CATT safely for Arabic.
    job_input.setdefault("useCattTashkeel", True)
    job_input.setdefault("safeTashkeel", True)
    job_input.setdefault("preserveSymbols", True)
    job_input.setdefault("preserveNumbers", True)
    job_input.setdefault("preservePunctuation", True)
    job_input.setdefault("returnAudioBase64", True)

    # Print clear diagnostics in RunPod logs.
    print("OCD ENTRYPOINT: model =", model)
    print("OCD ENTRYPOINT: ttsEngine =", job_input.get("ttsEngine"))
    print("OCD ENTRYPOINT: translationEngine =", job_input.get("translationEngine"))
    print("OCD ENTRYPOINT: useCattTashkeel =", job_input.get("useCattTashkeel"))
    print("OCD ENTRYPOINT: preserveSymbols =", job_input.get("preserveSymbols"))

    prepared["input"] = job_input
    return prepared


def handler(job: Dict[str, Any]) -> Any:
    prepared_job = _prepare_job(job)
    return _serverless_handler(prepared_job)


runpod.serverless.start({"handler": handler})
