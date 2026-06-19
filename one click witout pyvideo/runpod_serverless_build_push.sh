#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${1:-}"
if [ -z "$IMAGE_NAME" ]; then
  echo "Usage: ./runpod_serverless_build_push.sh docker.io/YOUR_USER/one-click-dub-serverless:latest"
  exit 1
fi

docker build -f Dockerfile.serverless -t "$IMAGE_NAME" .
docker push "$IMAGE_NAME"

echo "Pushed: $IMAGE_NAME"
