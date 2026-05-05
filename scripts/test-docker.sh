#!/usr/bin/env bash
###############################################################################
# Script: test-docker.sh
#
# Description:
#   Brings up a Docker Compose environment, waits for services to initialize
#   (polls HEALTHCHECK_URL if provided), and then tears the environment down.
#   This variant does not run Playwright or any test runner.
#
# Environment Variables:
#   CI                 - If unset, loads .env file (when present); if set, skips .env loading
#   BUILDKIT_PROGRESS  - (optional) Set to 'plain' for verbose Docker output
#   HEALTHCHECK_URL    - (optional) URL to poll to determine service readiness
#   WAIT_SECONDS       - (optional) fallback sleep seconds when HEALTHCHECK_URL unset (default 10)
#   HEALTHCHECK_TIMEOUT- (optional) max seconds to wait for healthcheck (default 120)
#
# Usage:
#   ./scripts/test-docker.sh
#
# Exit Codes:
#   0 - Success (services started and tear down completed)
#   1 - Failure (docker not available, compose failed, or healthcheck timeout)
#
###############################################################################

set -euo pipefail

# Optional: Use plain Docker build progress for easier debugging
# export BUILDKIT_PROGRESS=plain

# Ensure docker is available
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not in PATH" >&2
  exit 1
fi

# Select compose file (compose.yml preferred, fall back to docker-compose.yml)
if [ -f "compose.yml" ]; then
  COMPOSE_FILE="compose.yml"
elif [ -f "docker-compose.yml" ]; then
  COMPOSE_FILE="docker-compose.yml"
else
  echo "Error: no compose file found (compose.yml or docker-compose.yml)" >&2
  exit 1
fi

# Build arguments array for docker compose command
args=("-f" "$COMPOSE_FILE")

# Load .env file only in non-CI environments and only if file exists
if [ -z "${CI:-}" ] && [ -f ".env" ]; then
  args+=("--env-file" ".env")
fi

# Add standard compose up flags; remove orphans to avoid leftover services
args+=("up" "--detach" "--build" "--remove-orphans")

# Best-effort cleanup function; will run on EXIT
cleanup() {
  echo "Cleaning up Docker containers..."
  docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans || true
}
trap cleanup EXIT INT TERM

# Log the command in a safe, quote-preserved way
printf 'Running: docker compose'
for a in "${args[@]}"; do printf ' %q' "$a"; done
echo

# Start Docker Compose
if ! docker compose "${args[@]}"; then
  echo "Error: Failed to start Docker containers" >&2
  # cleanup will run via trap
  exit 1
fi

# Wait for container initialization and service stability.
# If HEALTHCHECK_URL is set, poll it until it returns success or timeout.
# Fallback to WAIT_SECONDS sleep if no URL provided or curl missing.
WAIT_SECONDS="${WAIT_SECONDS:-10}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
HEALTHCHECK_TIMEOUT="${HEALTHCHECK_TIMEOUT:-120}"

if [ -n "$HEALTHCHECK_URL" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    echo "Warning: HEALTHCHECK_URL set but 'curl' is not available; falling back to sleep ${WAIT_SECONDS}s" >&2
    sleep "$WAIT_SECONDS"
  else
    echo "Waiting up to ${HEALTHCHECK_TIMEOUT}s for ${HEALTHCHECK_URL}..."
    elapsed=0
    until curl -sSf "$HEALTHCHECK_URL" >/dev/null 2>&1; do
      sleep 2
      elapsed=$((elapsed + 2))
      if [ "$elapsed" -ge "$HEALTHCHECK_TIMEOUT" ]; then
        echo "Error: timeout waiting for ${HEALTHCHECK_URL}" >&2
        exit 1
      fi
    done
  fi
else
  echo "Waiting ${WAIT_SECONDS}s for container services to initialize..."
  sleep "$WAIT_SECONDS"
fi

echo "Services are initialized. No test runner is configured in this repository; exiting and cleaning up."

# Exit normally; trap will run cleanup to tear down the compose environment
exit 0