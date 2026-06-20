#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${OCD_ROOT:-/runpod-volume/one-click-dub}" \
         "${OCD_JOBS_DIR:-/runpod-volume/one-click-dub/jobs}" \
         "${OCD_OUTPUTS_DIR:-/runpod-volume/one-click-dub/outputs}" \
         "${HF_HOME:-/runpod-volume/.cache/huggingface}" \
         "$(dirname "${OCD_FISH_CHECKPOINT_DIR:-/runpod-volume/fish-speech/checkpoints/openaudio-s1-mini}")"

MODEL_NAME="${OCD_MODEL:-${OCD_ENDPOINT_MODEL:-fast}}"
TTS_ENGINE="${OCD_TTS_ENGINE:-}"
FISH_ENABLED="${OCD_ENABLE_FISH_API:-auto}"

should_start_fish=0
if [[ "$FISH_ENABLED" == "1" || "$FISH_ENABLED" == "true" || "$FISH_ENABLED" == "yes" || "$FISH_ENABLED" == "on" ]]; then
  should_start_fish=1
elif [[ "$FISH_ENABLED" == "auto" ]]; then
  if [[ "$MODEL_NAME" == "pro" || "$TTS_ENGINE" == "fish_speech" ]]; then
    should_start_fish=1
  fi
fi

if [[ "$should_start_fish" == "1" ]]; then
  export OCD_TTS_ENGINE="fish_speech"
  export OCD_FISH_SPEECH_API_URL="${OCD_FISH_SPEECH_API_URL:-http://127.0.0.1:8080/v1/tts}"
  export OCD_FISH_SPEECH_MODEL="${OCD_FISH_SPEECH_MODEL:-fishaudio/openaudio-s1-mini}"
  export OCD_FISH_CHECKPOINT_DIR="${OCD_FISH_CHECKPOINT_DIR:-/runpod-volume/fish-speech/checkpoints/openaudio-s1-mini}"
  export OCD_FISH_API_LISTEN="${OCD_FISH_API_LISTEN:-127.0.0.1:8080}"

  if [[ ! -f "${OCD_FISH_CHECKPOINT_DIR}/codec.pth" ]]; then
    echo "[OCD] Fish Speech checkpoint not found. Downloading ${OCD_FISH_SPEECH_MODEL} to ${OCD_FISH_CHECKPOINT_DIR} ..."
    python - <<'PY'
import os
from huggingface_hub import snapshot_download
repo_id = os.environ.get("OCD_FISH_SPEECH_MODEL", "fishaudio/openaudio-s1-mini")
local_dir = os.environ.get("OCD_FISH_CHECKPOINT_DIR", "/runpod-volume/fish-speech/checkpoints/openaudio-s1-mini")
token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
snapshot_download(repo_id=repo_id, local_dir=local_dir, token=token, local_dir_use_symlinks=False)
print(f"[OCD] Fish Speech checkpoint ready: {local_dir}")
PY
  else
    echo "[OCD] Fish Speech checkpoint already exists: ${OCD_FISH_CHECKPOINT_DIR}"
  fi

  echo "[OCD] Starting Fish Speech API on ${OCD_FISH_API_LISTEN} ..."
  cd /app/fish-speech
  compile_flag=""
  if [[ "${OCD_FISH_COMPILE:-0}" == "1" || "${OCD_FISH_COMPILE:-0}" == "true" ]]; then
    compile_flag="--compile"
  fi

  python -m tools.api_server \
    --listen "${OCD_FISH_API_LISTEN}" \
    --llama-checkpoint-path "${OCD_FISH_CHECKPOINT_DIR}" \
    --decoder-checkpoint-path "${OCD_FISH_CHECKPOINT_DIR}/codec.pth" \
    --decoder-config-name modded_dac_vq \
    ${compile_flag} &
  fish_pid=$!
  cd /app

  echo "[OCD] Waiting for Fish Speech API..."
  for i in $(seq 1 120); do
    if curl -fsS "http://127.0.0.1:8080/docs" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:8080/" >/dev/null 2>&1; then
      echo "[OCD] Fish Speech API is ready."
      break
    fi
    if ! kill -0 "$fish_pid" >/dev/null 2>&1; then
      echo "[OCD] Fish Speech API process exited early."
      wait "$fish_pid" || true
      exit 1
    fi
    sleep 2
  done
fi

cd /app
exec python -u handler.py
