#!/bin/sh
set -eu

export CLICKHOUSE_MCP_SERVER_TRANSPORT=http
export CLICKHOUSE_MCP_BIND_HOST=127.0.0.1
export CLICKHOUSE_MCP_BIND_PORT="${CLICKHOUSE_MCP_BIND_PORT:-8000}"
export CLICKHOUSE_MCP_AUTH_TOKEN="${CLICKHOUSE_MCP_AUTH_TOKEN:-storyisstraight-internal-mcp}"
export CLICKHOUSE_MCP_URL="${CLICKHOUSE_MCP_URL:-http://127.0.0.1:${CLICKHOUSE_MCP_BIND_PORT}/mcp}"

mcp-clickhouse >/tmp/mcp-clickhouse.log 2>&1 &
mcp_pid=$!
trap 'kill "$mcp_pid" 2>/dev/null || true' EXIT INT TERM

ready=0
for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${CLICKHOUSE_MCP_BIND_PORT}/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "ClickHouse MCP sidecar did not become healthy." >&2
  sed -n '1,120p' /tmp/mcp-clickhouse.log >&2 || true
  exit 1
fi

exec node agent-server.mjs
