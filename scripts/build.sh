#!/usr/bin/env bash
set -euo pipefail

# Build, tag and (optionally) push the application image.
#
# Usage: ./scripts/build.sh [tag] [--push]
#
# Examples:
#   ./scripts/build.sh                  # build with default tag from git
#   ./scripts/build.sh v1.2.3 --push    # tag v1.2.3 and push

TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
PUSH=false
if [[ "${2:-}" == "--push" ]]; then PUSH=true; fi

IMAGE="${IMAGE:-ghcr.io/$(git config --get user.name 2>/dev/null || echo local)/deployment-platform-app}"
IMAGE="${IMAGE,,}"   # lowercase

echo "Building ${IMAGE}:${TAG}"
docker build -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" ./app

if $PUSH; then
  echo "Pushing ${IMAGE}:${TAG}"
  docker push "${IMAGE}:${TAG}"
  docker push "${IMAGE}:latest"
fi
