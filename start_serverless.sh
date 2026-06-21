#!/usr/bin/env bash
set -euo pipefail

# Quality endpoint patch:
# - Force-disable hf_transfer at runtime even if the RunPod UI still has HF_HUB_ENABLE_HF_TRANSFER=1.
# - Force Quality/OmniVoice mode and block Fish startup.
# - Print a quick Higgs/Transformers diagnostic before starting the RunPod handler.
export HF_HUB_ENABLE_HF_TRANSFER=0
export OCD_ENDPOINT_MODEL="${OCD_ENDPOINT_MODEL:-quality}"
export OCD_MODEL="${OCD_MODEL:-quality}"
export OCD_TTS_ENGINE="${OCD_TTS_ENGINE:-omnivoice}"
export OCD_TRANSLATION_ENGINE="${OCD_TRANSLATION_ENGINE:-nllb200}"
export OCD_ENABLE_FISH_API=0

mkdir -p \
  "${OCD_ROOT:-/runpod-volume/one-click-dub}" \
  "${OCD_JOBS_DIR:-/runpod-volume/one-click-dub/jobs}" \
  "${OCD_OUTPUTS_DIR:-/runpod-volume/one-click-dub/outputs}" \
  "${HF_HOME:-/runpod-volume/.cache/huggingface}" \
  "${XDG_CACHE_HOME:-/runpod-volume/.cache}"

# Copy bundled ready voice reference WAVs from the image into the persistent RunPod volume.
mkdir -p /runpod-volume/one-click-dub/ready_voice_refs
if [ -d "/app/ready_voice_refs" ]; then
  cp -n /app/ready_voice_refs/* /runpod-volume/one-click-dub/ready_voice_refs/ 2>/dev/null || true
fi
export OCD_READY_VOICE_REFS_DIR="${OCD_READY_VOICE_REFS_DIR:-/runpod-volume/one-click-dub/ready_voice_refs}"
echo "[OCD QUALITY] Ready voice refs:"
ls -lh "$OCD_READY_VOICE_REFS_DIR" 2>/dev/null || true

echo "=== OCD QUALITY DIAG ==="
which python || true
python --version || true
echo "HF_HUB_ENABLE_HF_TRANSFER=${HF_HUB_ENABLE_HF_TRANSFER}"
echo "OCD_MODEL=${OCD_MODEL}"
echo "OCD_TTS_ENGINE=${OCD_TTS_ENGINE}"
python - <<'PY'
import sys
print('Python:', sys.version)
try:
    import torch
    print('Torch:', torch.__version__, 'CUDA:', torch.cuda.is_available())
except Exception as e:
    print('Torch import failed:', repr(e))
try:
    import transformers
    print('Transformers:', transformers.__version__)
    from transformers import HiggsAudioV2TokenizerModel
    print('HiggsAudioV2TokenizerModel import OK')
except Exception as e:
    print('HiggsAudioV2TokenizerModel import FAILED:', repr(e))
    raise
try:
    import omnivoice
    print('OmniVoice import OK')
except Exception as e:
    print('OmniVoice import FAILED:', repr(e))
    raise
PY
echo "=== END OCD QUALITY DIAG ==="

cd /app
if [ -f /app/handler.py ]; then
  exec python -u /app/handler.py
elif [ -f /app/serverless_handler.py ]; then
  exec python -u /app/serverless_handler.py
else
  echo "[OCD QUALITY] No handler.py or serverless_handler.py found in /app"
  ls -lah /app
  exit 1
fi
