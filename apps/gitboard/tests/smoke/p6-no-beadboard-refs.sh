#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -d "${ROOT_DIR}/../beadboard" ]]; then
  echo "apps/beadboard still exists" >&2
  exit 1
fi

matches="$(git -C "${ROOT_DIR}" grep -nE 'from .*beadboard|require.*beadboard|await import.*beadboard|app\.route.*beads|app\.get.*beadboard' -- src/ 2>/dev/null | grep -vE 'migration|legacy|historical|comment|^\s*//|^\s*\*|^\s*#|\*/|/\*' || true)"
if [[ -n "${matches}" ]]; then
  echo "functional beadboard refs remain" >&2
  echo "${matches}" >&2
  exit 1
fi

echo "p6-no-beadboard-refs: ok"
