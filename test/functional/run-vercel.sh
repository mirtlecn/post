#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
. "$ROOT_DIR/test/functional/common.sh"
LOG_FILE="$(mktemp)"
SERVER_PID=""
PORT="${PORT:-3020}"
REDIS_DB="${REDIS_DB:-11}"
SECRET_KEY="${SECRET_KEY:-demo}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${ADMIN_KEY:-$SECRET_KEY}}"

cleanup() {
  stop_local_server
}

trap cleanup EXIT

cd "$ROOT_DIR"
reset_test_redis

echo "[vercel] 启动 vercel dev"
env \
  "LINKS_REDIS_URL=$(redis_test_url)" \
  "SECRET_KEY=$SECRET_KEY" \
  "ADMIN_KEY=${ADMIN_KEY:-$SECRET_KEY}" \
  "FOOTER=${FOOTER:-}" \
  "BASE_DOMAIN=" \
  vercel dev --listen "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

wait_for_ready "http://localhost:$PORT/admin/" "$LOG_FILE"
echo "[vercel] 服务已就绪"

BASE_URL="http://localhost:$PORT" \
MODE="vercel" \
SECRET_KEY="$SECRET_KEY" \
ADMIN_PASSWORD="$ADMIN_PASSWORD" \
bash "$ROOT_DIR/test/functional/test-functional.sh"
