#!/usr/bin/env bash
set -euo pipefail

# One Click Dub Pro mode uses Fish S2-Pro LOCAL ONLY.
# This script starts the official Fish Speech local HTTP API server at /v1/tts.

export OCD_FISH_LOCAL_HOST="${OCD_FISH_LOCAL_HOST:-127.0.0.1}"
export OCD_FISH_LOCAL_PORT="${OCD_FISH_LOCAL_PORT:-8080}"
export OCD_FISH_LOCAL_URL="${OCD_FISH_LOCAL_URL:-http://${OCD_FISH_LOCAL_HOST}:${OCD_FISH_LOCAL_PORT}/v1/tts}"
export OCD_FISH_REPO_DIR="${OCD_FISH_REPO_DIR:-/opt/fish-speech}"
export OCD_FISH_CHECKPOINT_DIR="${OCD_FISH_CHECKPOINT_DIR:-/runpod-volume/fish-speech/checkpoints/s2-pro}"
export OCD_FISH_DOWNLOAD_WEIGHTS="${OCD_FISH_DOWNLOAD_WEIGHTS:-1}"
export OCD_FISH_USE_HALF="${OCD_FISH_USE_HALF:-1}"
export OCD_FISH_USE_COMPILE="${OCD_FISH_USE_COMPILE:-0}"
export OCD_FISH_WORKERS="${OCD_FISH_WORKERS:-1}"

mkdir -p "${OCD_FISH_CHECKPOINT_DIR}"

if [[ ! -d "${OCD_FISH_REPO_DIR}" ]]; then
  echo "[OCD][Fish] ERROR: Fish repo not found at ${OCD_FISH_REPO_DIR}" >&2
  echo "[OCD][Fish] Rebuild Docker image; Dockerfile must clone https://github.com/fishaudio/fish-speech.git and install it." >&2
  exit 64
fi

cd "${OCD_FISH_REPO_DIR}"

# Download S2-Pro weights to RunPod network volume so they persist across cold starts.
# Requires model access according to Fish/Hugging Face license terms. If HF needs auth, set HF_TOKEN.
if [[ "${OCD_FISH_DOWNLOAD_WEIGHTS}" == "1" ]]; then
  if [[ ! -f "${OCD_FISH_CHECKPOINT_DIR}/codec.pth" ]]; then
    echo "[OCD][Fish] Downloading fishaudio/s2-pro weights to ${OCD_FISH_CHECKPOINT_DIR} ..."
    if [[ -n "${HF_TOKEN:-}" ]]; then
      huggingface-cli login --token "${HF_TOKEN}" --add-to-git-credential || true
    fi
    hf download fishaudio/s2-pro --local-dir "${OCD_FISH_CHECKPOINT_DIR}"
  else
    echo "[OCD][Fish] S2-Pro weights already exist: ${OCD_FISH_CHECKPOINT_DIR}"
  fi
fi

if [[ ! -f "${OCD_FISH_CHECKPOINT_DIR}/codec.pth" ]]; then
  echo "[OCD][Fish] ERROR: Missing codec.pth in ${OCD_FISH_CHECKPOINT_DIR}" >&2
  echo "[OCD][Fish] Expected weights from: hf download fishaudio/s2-pro --local-dir ${OCD_FISH_CHECKPOINT_DIR}" >&2
  exit 65
fi

ARGS=(
  "tools/api_server.py"
  "--llama-checkpoint-path" "${OCD_FISH_CHECKPOINT_DIR}"
  "--decoder-checkpoint-path" "${OCD_FISH_CHECKPOINT_DIR}/codec.pth"
  "--listen" "${OCD_FISH_LOCAL_HOST}:${OCD_FISH_LOCAL_PORT}"
  "--workers" "${OCD_FISH_WORKERS}"
)

if [[ "${OCD_FISH_USE_HALF}" == "1" ]]; then
  ARGS+=("--half")
fi
if [[ "${OCD_FISH_USE_COMPILE}" == "1" ]]; then
  ARGS+=("--compile")
fi

# Allow full override if upstream Fish changes the command.
if [[ -n "${OCD_FISH_SERVER_COMMAND:-}" ]]; then
  echo "[OCD][Fish] Running custom command: ${OCD_FISH_SERVER_COMMAND}"
  exec bash -lc "${OCD_FISH_SERVER_COMMAND}"
fi

echo "[OCD][Fish] Starting local S2-Pro API server on ${OCD_FISH_LOCAL_HOST}:${OCD_FISH_LOCAL_PORT}"
echo "[OCD][Fish] Command: python ${ARGS[*]}"
exec python "${ARGS[@]}"
