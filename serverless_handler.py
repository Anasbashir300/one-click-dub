"""
One Click Dub - RunPod Serverless worker handler

Updated for the 3-endpoint architecture:
- fast    -> Edge TTS
- quality -> OmniVoice
- pro     -> Fish Speech

All models can use Arabic tashkeel safely. The safe tashkeel wrapper only sends
Arabic letter-runs to the CATT/diacritization function and preserves numbers,
punctuation, symbols, English text, URLs, dates, percentages, and currency signs.
"""

import os
import re
import time
import uuid
import base64
import traceback
from pathlib import Path
from typing import Dict, Any, Callable, Optional, Tuple


# -----------------------------------------------------------------------------
# Small env helpers
# -----------------------------------------------------------------------------

def _env_str(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default


def _normalize_model(value: Optional[str]) -> str:
    model = (value or "").strip().lower().replace("-", "_")
    if model in ("fast", "speed", "quick", "edge", "edge_tts"):
        return "fast"
    if model in ("quality", "omni", "omnivoice", "omni_voice"):
        return "quality"
    if model in ("pro", "fish", "fish_speech", "fishspeech"):
        return "pro"
    return "quality"


def _endpoint_model_from_env() -> str:
    return _normalize_model(
        _env_str("OCD_ENDPOINT_MODEL")
        or _env_str("OCD_MODEL")
        or _env_str("MODEL_NAME")
        or "quality"
    )


# -----------------------------------------------------------------------------
# Root/cache defaults. These MUST be set before importing the original backend.
# -----------------------------------------------------------------------------

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

# Serverless defaults.
os.environ.setdefault("OCD_RUNPOD_SERVERLESS", "1")
os.environ.setdefault("OCD_RUNPOD_MODE", "serverless")
os.environ.setdefault("OCD_MAX_GPU_JOBS", "1")
os.environ.setdefault("OCD_MAX_FAST_JOBS", "1")
os.environ.setdefault("OCD_WHISPER_COMPUTE_TYPE", "float16")
os.environ.setdefault("OCD_NLLB_MODEL", "facebook/nllb-200-distilled-600M")
os.environ.setdefault("OCD_NLLB_DTYPE", "float16")
os.environ.setdefault("OCD_NLLB_BEAMS", "2")
os.environ.setdefault("OCD_USE_PUNCTUATION", "1")
os.environ.setdefault("OCD_TTS_PUNCT_PAUSES", "1")
os.environ.setdefault("OCD_USE_CATT_TASHKEEL", "1")
os.environ.setdefault("OCD_SAFE_TASHKEEL", "1")
os.environ.setdefault("OCD_TASHKEEL_PRESERVE_NUMBERS", "1")
os.environ.setdefault("OCD_TASHKEEL_PRESERVE_PUNCTUATION", "1")
os.environ.setdefault("OCD_TASHKEEL_PRESERVE_SYMBOLS", "1")
os.environ.setdefault("OCD_DELETE_JOB_TEMP_AFTER_DONE", "1")
os.environ.setdefault("OCD_JOB_TEMP_TTL_SEC", "600")
os.environ.setdefault("OCD_DELETE_JOB_TEMP_AFTER_ERROR", "1")
os.environ.setdefault("OCD_JOB_ERROR_TEMP_TTL_SEC", "1800")
os.environ.setdefault("OCD_DELETE_OUTPUT_AFTER_TTL", "1")
os.environ.setdefault("OCD_OUTPUT_TTL_SEC", "21600")
os.environ.setdefault("OCD_YTDLP_REMOTE_EJS", "1")
os.environ.setdefault("OCD_YTDLP_USE_REQUEST_COOKIES", "0")


def _apply_endpoint_defaults(model: str) -> None:
    """Apply sane defaults for the dedicated endpoint before backend import.

    Values are set with setdefault, so RunPod Environment Variables still win.
    """
    model = _normalize_model(model)
    os.environ.setdefault("OCD_ENDPOINT_MODEL", model)
    os.environ.setdefault("OCD_MODEL", model)

    if model == "fast":
        # Fast must stay light: no OmniVoice and no Fish Speech.
        os.environ.setdefault("OCD_FAST_ASR_ENGINE", "faster-whisper")
        os.environ.setdefault("OCD_FAST_WHISPER_MODEL", "small")
        os.environ.setdefault("OCD_TTS_ENGINE", "edge")
        os.environ.setdefault("OCD_TRANSLATION_ENGINE", "google")
        os.environ.setdefault("OCD_AUDIO_BITRATE", "128k")
        os.environ.setdefault("OCD_CHUNK_MAX_CHARS", "450")
        os.environ.setdefault("OCD_CHUNK_MIN_CHARS", "180")

    elif model == "quality":
        # Quality uses OmniVoice + NLLB + per-video auto clone.
        os.environ.setdefault("OCD_QUALITY_WHISPER_MODEL", "large-v3")
        os.environ.setdefault("OCD_TTS_ENGINE", "omnivoice")
        os.environ.setdefault("OCD_TRANSLATION_ENGINE", "nllb200")
        os.environ.setdefault("OCD_OMNIVOICE_AUTO_CLONE", "1")
        os.environ.setdefault("OCD_OMNIVOICE_REF_MODE", "per_job")
        os.environ.setdefault("OCD_OMNIVOICE_REF_SECONDS", "12")
        os.environ.setdefault("OCD_OMNIVOICE_MIN_REF_SECONDS", "6")
        os.environ.setdefault("OCD_OMNIVOICE_MAX_REF_SECONDS", "15")
        os.environ.setdefault("OCD_OMNIVOICE_STEPS", "24")
        os.environ.setdefault("OCD_OMNIVOICE_GUIDANCE", "2.0")
        os.environ.setdefault("OCD_OMNIVOICE_TTS_MAX_CHARS", "190")
        os.environ.setdefault("OCD_AUDIO_BITRATE", "192k")
        os.environ.setdefault("OCD_CHUNK_MAX_CHARS", "380")
        os.environ.setdefault("OCD_CHUNK_MIN_CHARS", "160")

    elif model == "pro":
        # Pro uses Fish Speech + NLLB + per-video auto clone. No OmniVoice here.
        os.environ.setdefault("OCD_QUALITY_WHISPER_MODEL", "large-v3")
        os.environ.setdefault("OCD_TTS_ENGINE", "fish_speech")
        os.environ.setdefault("OCD_TRANSLATION_ENGINE", "nllb200")
        os.environ.setdefault("OCD_USE_FISH_SPEECH", "1")
        os.environ.setdefault("OCD_FISH_SPEECH_AUTO_CLONE", "1")
        os.environ.setdefault("OCD_FISH_SPEECH_REF_MODE", "per_job")
        os.environ.setdefault("OCD_FISH_SPEECH_REF_SECONDS", "15")
        os.environ.setdefault("OCD_FISH_SPEECH_MIN_REF_SECONDS", "10")
        os.environ.setdefault("OCD_FISH_SPEECH_MAX_REF_SECONDS", "30")
        # Use the model name your Docker supports. This default avoids the older gated s1-mini id.
        os.environ.setdefault("OCD_FISH_SPEECH_MODEL", "fishaudio/openaudio-s1-mini")
        os.environ.setdefault("OCD_FISH_SPEECH_DEVICE", "cuda")
        os.environ.setdefault("OCD_AUDIO_BITRATE", "256k")
        os.environ.setdefault("OCD_CHUNK_MAX_CHARS", "320")
        os.environ.setdefault("OCD_CHUNK_MIN_CHARS", "120")


ENDPOINT_MODEL = _endpoint_model_from_env()
_apply_endpoint_defaults(ENDPOINT_MODEL)

Path(os.environ["OCD_JOBS_DIR"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["OCD_OUTPUTS_DIR"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["HF_HOME"]).mkdir(parents=True, exist_ok=True)


# -----------------------------------------------------------------------------
# Safe Arabic tashkeel wrapper
# -----------------------------------------------------------------------------

ARABIC_LETTERS = r"\u0621-\u063A\u0641-\u064A\u0671-\u06D3\u06FA-\u06FF"
ARABIC_RUN_RE = re.compile(rf"[{ARABIC_LETTERS}]+(?:\s+[{ARABIC_LETTERS}]+)*")


def _is_arabic_target(lang: str) -> bool:
    value = (lang or "").strip().lower()
    return value.startswith("ar") or value in ("arabic", "العربية")


def _split_long_arabic_run(text: str, max_chars: int = 220) -> list[str]:
    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    for word in words:
        candidate = " ".join(current + [word])
        if len(candidate) > max_chars and current:
            chunks.append(" ".join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        chunks.append(" ".join(current))
    return chunks


def safe_catt_tashkeel_preserve_symbols(
    text: str,
    target_lang: str,
    catt_func: Callable[[str], str],
    max_run_chars: int = 220,
) -> str:
    """Diacritize Arabic words while preserving everything else exactly.

    This prevents CATT/diacritization cleanup from deleting:
    - numbers: 2026, 1,250
    - punctuation: . , ! ? ؟ ، : ; -
    - symbols: %, $, @, #
    - dates, URLs, English words, and spacing outside Arabic runs
    """
    if not text or not _is_arabic_target(target_lang):
        return text

    output: list[str] = []
    last_end = 0

    for match in ARABIC_RUN_RE.finditer(text):
        start, end = match.span()
        output.append(text[last_end:start])

        arabic_run = match.group(0)
        try:
            parts = _split_long_arabic_run(arabic_run, max_chars=max_run_chars)
            diacritized_parts: list[str] = []
            for part in parts:
                if len(part.strip()) <= 1:
                    diacritized_parts.append(part)
                    continue
                diacritized = catt_func(part)
                if not diacritized or not str(diacritized).strip():
                    diacritized = part
                diacritized_parts.append(str(diacritized).strip())
            output.append(" ".join(diacritized_parts))
        except Exception as exc:
            print("CATT SAFE TASHKEEL failed; keeping original Arabic run:", repr(exc))
            output.append(arabic_run)

        last_end = end

    output.append(text[last_end:])
    return "".join(output)


def _wrap_backend_tashkeel_function(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Wrap an existing backend CATT function without knowing its exact signature."""

    def wrapped(text: str, *args: Any, **kwargs: Any) -> str:
        target_lang = (
            kwargs.get("target_lang")
            or kwargs.get("targetLang")
            or kwargs.get("lang")
            or kwargs.get("language")
            or _env_str("OCD_TARGET_LANG", "ar")
        )

        if not _env_bool("OCD_USE_CATT_TASHKEEL", True):
            return text

        if not _env_bool("OCD_SAFE_TASHKEEL", True):
            try:
                return fn(text, *args, **kwargs)
            except TypeError:
                return fn(text)

        def call_original(arabic_only_text: str) -> str:
            try:
                return fn(arabic_only_text, *args, **kwargs)
            except TypeError:
                return fn(arabic_only_text)

        return safe_catt_tashkeel_preserve_symbols(
            text=text,
            target_lang=str(target_lang),
            catt_func=call_original,
            max_run_chars=_env_int("OCD_TASHKEEL_MAX_RUN_CHARS", 220),
        )

    return wrapped


# Import the existing pipeline after env setup.
import colab_custom_dub_server as backend  # noqa: E402


def _patch_backend_safe_tashkeel() -> None:
    """Monkey patch likely CATT/tashkeel functions in the backend.

    The real backend file name/function names changed several times during development,
    so this patch checks common function names and wraps whichever exists.
    """
    if not _env_bool("OCD_USE_CATT_TASHKEEL", True):
        return

    candidate_names = (
        "apply_catt_tashkeel",
        "apply_tashkeel",
        "catt_tashkeel",
        "catt_diacritize",
        "diacritize_arabic",
        "diacritize_arabic_text",
        "tashkeel_text",
        "arabic_tashkeel",
    )

    patched = []
    for name in candidate_names:
        original = getattr(backend, name, None)
        if callable(original) and not getattr(original, "_ocd_safe_tashkeel_wrapped", False):
            wrapper = _wrap_backend_tashkeel_function(original)
            setattr(wrapper, "_ocd_safe_tashkeel_wrapped", True)
            setattr(backend, name, wrapper)
            patched.append(name)

    if patched:
        print("OCD SAFE TASHKEEL: patched backend functions:", ", ".join(patched))
    else:
        print("OCD SAFE TASHKEEL: no known backend tashkeel function found to patch")


_patch_backend_safe_tashkeel()


# -----------------------------------------------------------------------------
# Request routing for fast / quality / pro
# -----------------------------------------------------------------------------

def _profile_for_model(model: str) -> Dict[str, Any]:
    model = _normalize_model(model)
    if model == "fast":
        return {
            "modelName": "fast",
            "ttsType": 0,
            "translationEngine": "google",
            "voiceName": "edge-auto",
            "ttsEngine": "edge",
        }
    if model == "quality":
        return {
            "modelName": "quality",
            "ttsType": 2,
            "translationEngine": "nllb200",
            "voiceName": "auto-clone-video",
            "ttsEngine": "omnivoice",
        }
    if model == "pro":
        return {
            "modelName": "pro",
            # 3 is reserved here for Fish Speech. The backend must support it.
            "ttsType": 3,
            "translationEngine": "nllb200",
            "voiceName": "auto-clone-video",
            "ttsEngine": "fish_speech",
        }
    raise ValueError(f"Unsupported model: {model}")


def _select_model_from_payload(payload: Dict[str, Any]) -> str:
    endpoint_model = _endpoint_model_from_env()
    allow_request_override = _env_bool("OCD_ALLOW_REQUEST_MODEL_OVERRIDE", False)
    if allow_request_override:
        return _normalize_model(
            payload.get("modelName")
            or payload.get("model")
            or payload.get("model_name")
            or endpoint_model
        )
    return endpoint_model


def _clean_input(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(payload or {})
    data.setdefault("url", data.get("videoUrl") or "")
    data.setdefault("sourceLanguage", data.get("sourceLang") or "auto")
    data.setdefault("targetLanguage", data.get("targetLang") or "ar")
    data.setdefault("cuda", True)

    selected_model = _select_model_from_payload(data)
    profile = _profile_for_model(selected_model)

    # Force the dedicated endpoint profile so the wrong model is not loaded by accident.
    data["modelName"] = profile["modelName"]
    data["ttsType"] = profile["ttsType"]
    data["translationEngine"] = profile["translationEngine"]
    data.setdefault("voiceName", profile["voiceName"])

    # Tell backend/helpers the current target language for the safe CATT wrapper.
    os.environ["OCD_TARGET_LANG"] = str(data.get("targetLanguage", "ar"))

    # Keep backend env consistent with the selected endpoint.
    os.environ["OCD_MODEL"] = selected_model
    os.environ["OCD_ENDPOINT_MODEL"] = selected_model
    os.environ["OCD_TTS_ENGINE"] = profile["ttsEngine"]
    os.environ["OCD_TRANSLATION_ENGINE"] = profile["translationEngine"]
    os.environ["OCD_USE_CATT_TASHKEEL"] = "1"
    os.environ["OCD_SAFE_TASHKEEL"] = "1"

    # Never trust browser cookies in a public serverless endpoint by default.
    if os.environ.get("OCD_ACCEPT_BROWSER_COOKIES", "0") != "1":
        data["cookieString"] = ""

    print(
        "OCD REQUEST ROUTER:",
        "model=", selected_model,
        "ttsType=", data.get("ttsType"),
        "translation=", data.get("translationEngine"),
        "target=", data.get("targetLanguage"),
        "safeTashkeel=", os.environ.get("OCD_SAFE_TASHKEEL"),
    )
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
            h["endpointModel"] = _endpoint_model_from_env()
            h["ttsEngine"] = os.environ.get("OCD_TTS_ENGINE")
            h["safeTashkeel"] = _env_bool("OCD_SAFE_TASHKEEL", True)
            h["useCattTashkeel"] = _env_bool("OCD_USE_CATT_TASHKEEL", True)
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
            "endpointModel": payload.get("modelName"),
            "ttsType": payload.get("ttsType"),
            "translationEngine": payload.get("translationEngine"),
            "safeTashkeel": True,
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
        return {
            "ok": True,
            "jobId": job_id,
            "status": "done",
            "elapsedSec": round(time.time() - started, 2),
            **audio,
            "meta": {
                "endpointModel": payload.get("modelName"),
                "requestedTtsType": payload.get("ttsType"),
                "requestedTranslationEngine": payload.get("translationEngine"),
                "safeTashkeel": True,
                "preserveNumbers": True,
                "preservePunctuation": True,
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
