#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${OCD_ROOT:-/runpod-volume/one-click-dub}"
export OCD_SERVERLESS_OUTPUT_BASE64="${OCD_SERVERLESS_OUTPUT_BASE64:-1}"
export OCD_FISH_TTS_MODE="${OCD_FISH_TTS_MODE:-local-http}"
export OCD_FISH_LOCAL_URL="${OCD_FISH_LOCAL_URL:-http://127.0.0.1:8080/v1/tts}"
export OCD_AUTOSTART_FISH_ON_PRO="${OCD_AUTOSTART_FISH_ON_PRO:-1}"

wait_for_fish() {
  local timeout="${OCD_FISH_STARTUP_TIMEOUT_SEC:-900}"
  local start_ts
  start_ts=$(date +%s)
  echo "[OCD] Waiting for Fish health at http://127.0.0.1:8080/v1/health for up to ${timeout}s..."
  while true; do
    if curl -fsS "http://127.0.0.1:8080/v1/health" >/tmp/ocd_fish_health.json 2>/tmp/ocd_fish_health.err; then
      echo "[OCD] Fish local server is ready: $(cat /tmp/ocd_fish_health.json)"
      return 0
    fi
    if (( $(date +%s) - start_ts > timeout )); then
      echo "[OCD] ERROR: Fish local server did not become ready." >&2
      echo "[OCD] Last fish log:" >&2
      tail -n 120 /tmp/ocd_fish_server.log 2>/dev/null || true
      return 1
    fi
    sleep 5
  done
}

# For Pro mode you want Fish already warm when the worker receives a job.
# Default is ON. Set OCD_START_FISH_SERVER=0 only if you intentionally want lazy startup.
if [[ "${OCD_START_FISH_SERVER:-1}" == "1" ]]; then
  echo "[OCD] Starting Fish S2-Pro local server in background..."
  bash /app/start_fish_s2_local_server.sh > /tmp/ocd_fish_server.log 2>&1 &
  echo $! > /tmp/ocd_fish_server.pid
  if [[ "${OCD_WAIT_FOR_FISH_BEFORE_WORKER:-1}" == "1" ]]; then
    wait_for_fish
  else
    sleep "${OCD_FISH_SERVER_WARMUP_SEC:-10}"
  fi
fi

exec python /app/runpod_handler.py
