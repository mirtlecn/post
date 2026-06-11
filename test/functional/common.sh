#!/bin/bash

function require_base_url() {
  if [ -z "${BASE_URL:-}" ]; then
    echo "缺少 BASE_URL"
    exit 1
  fi
}

function init_http_test() {
  TMP_DIR="$(mktemp -d)"
  BODY_FILE="$TMP_DIR/body.txt"
  HEADERS_FILE="$TMP_DIR/headers.txt"
  LAST_STATUS=""
  LAST_BODY=""
  LAST_HEADERS=""
  CURRENT_STEP=""
  REQUEST_METHOD=""
  REQUEST_URL=""
  EXPECTED_STATUS=""
}

function cleanup_http_test() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
    /bin/rm -rf "$TMP_DIR"
  fi
}

function log() {
  echo "[${MODE:-smoke}] $1"
}

function fail() {
  local message="$1"
  echo "FAIL: $CURRENT_STEP"
  echo "原因: $message"
  if [ -n "${REQUEST_METHOD:-}" ] || [ -n "${REQUEST_URL:-}" ]; then
    echo "请求: ${REQUEST_METHOD:-GET} ${REQUEST_URL:-}"
  fi
  if [ -n "${EXPECTED_STATUS:-}" ]; then
    echo "期望状态码: $EXPECTED_STATUS"
  fi
  if [ -n "${LAST_STATUS:-}" ]; then
    echo "实际状态码: $LAST_STATUS"
  fi
  if [ -f "${HEADERS_FILE:-}" ]; then
    echo "响应头:"
    /usr/bin/sed -n '1,16p' "$HEADERS_FILE"
  fi
  if [ -f "${BODY_FILE:-}" ]; then
    echo "响应体:"
    /usr/bin/sed -n '1,60p' "$BODY_FILE"
  fi
  exit 1
}

function request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  if [ "$#" -ge 3 ]; then
    shift 3
  else
    shift "$#"
  fi

  REQUEST_METHOD="$method"
  REQUEST_URL="$url"
  : >"$BODY_FILE"
  : >"$HEADERS_FILE"

  local args=(
    -sS
    -D "$HEADERS_FILE"
    -o "$BODY_FILE"
    -X "$method"
    "$url"
  )

  if [ -n "$body" ]; then
    args+=(-d "$body")
  fi

  while [ "$#" -gt 0 ]; do
    args+=("$1")
    shift
  done

  LAST_STATUS="$(
    /usr/bin/curl \
      "${args[@]}" \
      -w "%{http_code}"
  )"
  LAST_BODY="$(/bin/cat "$BODY_FILE" 2>/dev/null || true)"
  LAST_HEADERS="$(/bin/cat "$HEADERS_FILE" 2>/dev/null || true)"
}

function expect_status() {
  EXPECTED_STATUS="$1"
  if [ "$LAST_STATUS" != "$EXPECTED_STATUS" ]; then
    fail "状态码不符合预期"
  fi
}

function expect_header_contains() {
  local needle="$1"
  if ! /usr/bin/grep -Eiq "$needle" "$HEADERS_FILE"; then
    fail "响应头未包含: $needle"
  fi
}

function expect_header_not_contains() {
  local needle="$1"
  if /usr/bin/grep -Eiq "$needle" "$HEADERS_FILE"; then
    fail "响应头不应包含: $needle"
  fi
}

function expect_body_contains() {
  local needle="$1"
  if ! /usr/bin/grep -Fq "$needle" "$BODY_FILE"; then
    fail "响应体未包含: $needle"
  fi
}

function expect_body_not_contains() {
  local needle="$1"
  if /usr/bin/grep -Fq "$needle" "$BODY_FILE"; then
    fail "响应体不应包含: $needle"
  fi
}

function expect_body_matches() {
  local pattern="$1"
  if ! /usr/bin/grep -Eq "$pattern" "$BODY_FILE"; then
    fail "响应体未匹配正则: $pattern"
  fi
}

function expect_location() {
  local expected="$1"
  local actual
  actual="$(
    /usr/bin/grep -i '^location:' "$HEADERS_FILE" | /usr/bin/head -n 1 | /usr/bin/cut -d' ' -f2- | /usr/bin/tr -d '\r'
  )"
  if [ "$actual" != "$expected" ]; then
    fail "Location 不匹配，期望 ${expected}，实际 ${actual:-<empty>}"
  fi
}

function expect_json_error_message() {
  local message="$1"
  expect_body_contains "\"code\":\"invalid_request\""
  expect_body_contains "\"error\":\"$message\""
}

function expect_equals() {
  local actual="$1"
  local expected="$2"
  if [ "$actual" != "$expected" ]; then
    fail "值不符合预期，期望 [$expected]，实际 [$actual]"
  fi
}

function expect_redis_contains() {
  local value="$1"
  local needle="$2"
  if ! printf '%s' "$value" | /usr/bin/grep -Fq "$needle"; then
    fail "Redis 值未包含: $needle"
  fi
}

function expect_redis_not_contains() {
  local value="$1"
  local needle="$2"
  if printf '%s' "$value" | /usr/bin/grep -Fq "$needle"; then
    fail "Redis 值不应包含: $needle"
  fi
}

function uniq_path() {
  echo "smoke-$1-$(date +%s)-$RANDOM"
}

function wait_for_ready() {
  local url="$1"
  local log_file="$2"
  local retries="${3:-90}"
  local attempt

  for attempt in $(seq 1 "$retries"); do
    if /usr/bin/curl -s -o /dev/null "$url"; then
      return 0
    fi
    sleep 1
  done

  echo "服务启动超时: $url"
  /usr/bin/sed -n '1,120p' "$log_file" || true
  exit 1
}

function start_local_server() {
  ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
  LOG_FILE="$(mktemp)"
  SERVER_PID=""

  redis-cli -n "$REDIS_DB" FLUSHDB >/dev/null

  echo "[$MODE] 启动 npm start"
  local env_args=(
    "LINKS_REDIS_URL=redis://localhost:6379/$REDIS_DB"
    "SECRET_KEY=$SECRET_KEY"
    "FOOTER=${FOOTER:-}"
    "PORT=$PORT"
  )
  local env_name
  for env_name in \
    MAX_CONTENT_SIZE_KB \
    MAX_FILE_SIZE_MB \
    S3_ENDPOINT \
    S3_ACCESS_KEY_ID \
    S3_SECRET_ACCESS_KEY \
    S3_BUCKET_NAME \
    S3_REGION \
    S3_FORCE_PATH_STYLE
  do
    if [ -n "${!env_name:-}" ]; then
      env_args+=("$env_name=${!env_name}")
    fi
  done

  env "${env_args[@]}" npm start >"$LOG_FILE" 2>&1 &
  SERVER_PID=$!

  wait_for_ready "http://localhost:$PORT/admin" "$LOG_FILE"
  echo "[$MODE] 服务已就绪"
}

function stop_local_server() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "${LOG_FILE:-}" ]; then
    /bin/rm -f "$LOG_FILE"
  fi
}
