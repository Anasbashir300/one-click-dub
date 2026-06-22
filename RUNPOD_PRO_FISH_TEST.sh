#!/usr/bin/env bash
set -euo pipefail
: "${RUNPOD_ENDPOINT_ID:?set RUNPOD_ENDPOINT_ID}"
: "${RUNPOD_API_KEY:?set RUNPOD_API_KEY}"

JOB=$(curl -s -X POST "https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run" \
  -H "Authorization: Bearer ${RUNPOD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"input":{"health":true}}')

echo "$JOB"
JOB_ID=$(python - <<'PY' "$JOB"
import json,sys
print(json.loads(sys.argv[1]).get('id',''))
PY
)

echo "JOB_ID=$JOB_ID"
curl -s "https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${JOB_ID}" \
  -H "Authorization: Bearer ${RUNPOD_API_KEY}" | python -m json.tool
