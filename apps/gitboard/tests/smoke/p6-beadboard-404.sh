#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
APP_PID=""

cleanup() {
  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

PORT=3099 GITBOARD_DATA_DIR="${TMP_DIR}/data" SKIP_GITHUB_POLLER=1 bun --cwd "${ROOT_DIR}" src/index.ts >/dev/null 2>&1 &
APP_PID="$!"

for _ in {1..100}; do
  if curl -fsS "http://localhost:3099/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

check_404() {
  local path="$1"
  local status
  status="$(curl -o /dev/null -s -w "%{http_code}" "http://localhost:3099${path}")"
  if [[ "${status}" != "404" ]]; then
    echo "expected 404 for ${path}, got ${status}" >&2
    exit 1
  fi
}

check_404 "/beadboard"
check_404 "/api/beads/projects"

echo "p6-beadboard-404: ok"
