#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export PIP_NO_INPUT=1
export PIP_BREAK_SYSTEM_PACKAGES=1

apt-get update -y
apt-get install -y ffmpeg git curl wget unzip nodejs npm python3-pip python3-venv

# Some RunPod base images ship with wheel installed without RECORD metadata.
# Normal pip upgrade may fail with: uninstall-no-record-file.
# --ignore-installed installs over it instead of trying to uninstall it.
python -m pip install --no-cache-dir --ignore-installed -U pip setuptools packaging wheel

python -m pip install -U --no-cache-dir \
  fastapi "uvicorn[standard]" python-multipart pydantic requests \
  yt-dlp edge-tts faster-whisper openai-whisper \
  numpy soundfile scipy pydub \
  transformers sentencepiece accelerate huggingface_hub safetensors \
  catt-tashkeel

# Deno helps yt-dlp solve newer YouTube EJS/n-signature challenges.
if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh | sh
fi
export PATH="$PATH:/root/.deno/bin"

# OmniVoice install differs by image. Try PyPI first, then GitHub fallback.
python -m pip install -U --no-cache-dir omnivoice || \
python -m pip install -U --no-cache-dir git+https://github.com/k2-fsa/OmniVoice.git || true

echo "Install finished. If OmniVoice failed, install it using the official command for your RunPod image/repo."
