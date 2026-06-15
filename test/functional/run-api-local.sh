#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-3022}"
REDIS_DB="${REDIS_DB:-10}"
SECRET_KEY="${SECRET_KEY:-demo}"
SMOKE_FOOTER_TEXT="${SMOKE_FOOTER_TEXT:-smoke-footer-819be7}"
FOOTER="$(printf '%s' "$SMOKE_FOOTER_TEXT" | /usr/bin/base64 | /usr/bin/tr -d '\n')"
MODE="api-local"
. "$ROOT_DIR/test/functional/common.sh"

cleanup() {
  stop_local_server
}

trap cleanup EXIT

cd "$ROOT_DIR"
start_local_server

BASE_URL="http://localhost:$PORT" \
MODE="$MODE" \
SECRET_KEY="$SECRET_KEY" \
REDIS_HOST="$REDIS_HOST" \
REDIS_PORT="$REDIS_PORT" \
REDIS_DB="$REDIS_DB" \
FOOTER="$FOOTER" \
SMOKE_FOOTER_TEXT="$SMOKE_FOOTER_TEXT" \
bash "$ROOT_DIR/test/functional/smoke-api.sh"
