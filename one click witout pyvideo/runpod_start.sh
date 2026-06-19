#!/usr/bin/env bash
set -euo pipefail

# Put your RunPod HTTP proxy URL here, or export PUBLIC_BASE_URL before running.
# Example: export PUBLIC_BASE_URL="https://abc123-8000.proxy.runpod.net"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://YOUR-RUNPOD-POD-ID-8000.proxy.runpod.net}"

export OCD_RUNPOD_MODE="${OCD_RUNPOD_MODE:-1}"
export OCD_ROOT="${OCD_ROOT:-/workspace/one-click-dub-runtime}"
export OCD_JOBS_DIR="${OCD_JOBS_DIR:-$OCD_ROOT/ocd_custom_jobs}"
export OCD_OUTPUTS_DIR="${OCD_OUTPUTS_DIR:-$OCD_ROOT/ocd_custom_outputs}"
mkdir -p "$OCD_JOBS_DIR" "$OCD_OUTPUTS_DIR" "$OCD_ROOT/omnivoice_refs" /workspace/.cache/huggingface

export HF_HOME="${HF_HOME:-/workspace/.cache/huggingface}"
export TRANSFORMERS_CACHE="${TRANSFORMERS_CACHE:-/workspace/.cache/huggingface}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/workspace/.cache}"
export PATH="$PATH:/root/.deno/bin"

# GPU queue: RTX 3090 has 24GB VRAM, but OmniVoice/NLLB/Faster-Whisper should be serialized.
export OCD_MAX_GPU_JOBS="${OCD_MAX_GPU_JOBS:-1}"
export OCD_MAX_FAST_JOBS="${OCD_MAX_FAST_JOBS:-1}"

# yt-dlp: audio-first, YouTube EJS solver, no cookie headers.
export OCD_YTDLP_REMOTE_EJS="${OCD_YTDLP_REMOTE_EJS:-1}"
export OCD_YTDLP_REMOTE_COMPONENTS="${OCD_YTDLP_REMOTE_COMPONENTS:-ejs:github}"
export OCD_YTDLP_FORMAT="${OCD_YTDLP_FORMAT:-ba[ext=m4a]/bestaudio[ext=m4a]/bestaudio/best}"
export OCD_YTDLP_USE_REQUEST_COOKIES="${OCD_YTDLP_USE_REQUEST_COOKIES:-0}"

# Fast mode: speed and stability.
export OCD_FAST_ASR_ENGINE="${OCD_FAST_ASR_ENGINE:-faster-whisper}"
export OCD_FAST_WHISPER_MODEL="${OCD_FAST_WHISPER_MODEL:-large-v3-turbo}"
export OCD_WHISPER_COMPUTE_TYPE="${OCD_WHISPER_COMPUTE_TYPE:-float16}"
export OCD_WHISPER_BEAM_SIZE="${OCD_WHISPER_BEAM_SIZE:-3}"

# Quality mode: strongest practical default for RTX 3090.
export OCD_QUALITY_WHISPER_MODEL="${OCD_QUALITY_WHISPER_MODEL:-large-v3}"
export OCD_NLLB_MODEL="${OCD_NLLB_MODEL:-facebook/nllb-200-distilled-600M}"
export OCD_NLLB_DTYPE="${OCD_NLLB_DTYPE:-float16}"
export OCD_NLLB_BEAMS="${OCD_NLLB_BEAMS:-2}"
export OCD_OMNIVOICE_AUTO_CLONE="${OCD_OMNIVOICE_AUTO_CLONE:-1}"
export OCD_OMNIVOICE_MODEL="${OCD_OMNIVOICE_MODEL:-k2-fsa/OmniVoice}"
export OCD_OMNIVOICE_DTYPE="${OCD_OMNIVOICE_DTYPE:-float16}"
export OCD_OMNIVOICE_STEPS="${OCD_OMNIVOICE_STEPS:-24}"
export OCD_OMNIVOICE_GUIDANCE="${OCD_OMNIVOICE_GUIDANCE:-2.0}"
export OCD_OMNIVOICE_SPEED="${OCD_OMNIVOICE_SPEED:-1.16}"
export OCD_OMNIVOICE_TTS_MAX_CHARS="${OCD_OMNIVOICE_TTS_MAX_CHARS:-190}"
export OCD_OMNIVOICE_REFS_DIR="${OCD_OMNIVOICE_REFS_DIR:-$OCD_ROOT/omnivoice_refs}"

# Arabic + punctuation + natural pauses.
export OCD_USE_CATT_TASHKEEL="${OCD_USE_CATT_TASHKEEL:-1}"
export OCD_CATT_MODEL="${OCD_CATT_MODEL:-eo}"
export OCD_USE_PUNCTUATION="${OCD_USE_PUNCTUATION:-1}"
export OCD_MULTI_PUNCT_MODEL="${OCD_MULTI_PUNCT_MODEL:-oliverguhr/fullstop-punctuation-multilang-large}"
export OCD_PUNCT_CHUNK_WORDS="${OCD_PUNCT_CHUNK_WORDS:-180}"
export OCD_PUNCT_OVERLAP_WORDS="${OCD_PUNCT_OVERLAP_WORDS:-5}"
export OCD_PUNCT_MIN_WORDS="${OCD_PUNCT_MIN_WORDS:-7}"
export OCD_TTS_PUNCT_PAUSES="${OCD_TTS_PUNCT_PAUSES:-1}"
export OCD_TTS_PAUSE_ON_COMMA="${OCD_TTS_PAUSE_ON_COMMA:-1}"
export OCD_TTS_PAUSE_COMMA="${OCD_TTS_PAUSE_COMMA:-0.22}"
export OCD_TTS_PAUSE_SEMICOLON="${OCD_TTS_PAUSE_SEMICOLON:-0.32}"
export OCD_TTS_PAUSE_SENTENCE="${OCD_TTS_PAUSE_SENTENCE:-0.48}"
export OCD_TTS_PAUSE_MIN_CHARS="${OCD_TTS_PAUSE_MIN_CHARS:-24}"
export OCD_TTS_PAUSE_MAX_PARTS_PER_CHUNK="${OCD_TTS_PAUSE_MAX_PARTS_PER_CHUNK:-6}"
export OCD_TTS_PAUSE_MAX_RATIO="${OCD_TTS_PAUSE_MAX_RATIO:-0.32}"

# Cleanup.
export OCD_DELETE_JOB_TEMP_AFTER_DONE="${OCD_DELETE_JOB_TEMP_AFTER_DONE:-1}"
export OCD_JOB_TEMP_TTL_SEC="${OCD_JOB_TEMP_TTL_SEC:-600}"
export OCD_DELETE_JOB_TEMP_AFTER_ERROR="${OCD_DELETE_JOB_TEMP_AFTER_ERROR:-1}"
export OCD_JOB_ERROR_TEMP_TTL_SEC="${OCD_JOB_ERROR_TEMP_TTL_SEC:-1800}"
export OCD_DELETE_OUTPUT_AFTER_TTL="${OCD_DELETE_OUTPUT_AFTER_TTL:-1}"
export OCD_OUTPUT_TTL_SEC="${OCD_OUTPUT_TTL_SEC:-21600}"

python -m uvicorn colab_custom_dub_server:app --host 0.0.0.0 --port 8000 --workers 1
