#!/usr/bin/env bash
# =============================================================================
# 7Gather - Docker Compose Integration Test
# =============================================================================
# Tests that all services start correctly and are accessible.
#
# Usage:
#   ./tests/integration/docker-compose-test.sh
#
# Requirements:
#   - Docker and Docker Compose installed
#   - curl installed
#   - Optional: wscat (npm install -g wscat) for WebSocket test
#
# Validates:
#   - Requirement 10.1: docker compose up starts all services in ≤120s
#   - Requirement 10.5: WebSocket through Nginx proxy
#   - Requirement 10.6: Container restart on failure
# =============================================================================

set -euo pipefail

# Configuration
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
MAX_WAIT_SECONDS=120
COLYSEUS_HEALTH_URL="http://localhost:2567/health"
COLYSEUS_WS_URL="ws://localhost:2567"
NGINX_HTTP_URL="http://localhost:80"
POLL_INTERVAL=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Utility functions
# =============================================================================

log_info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((TESTS_FAILED++))
}

cleanup() {
  log_info "Tearing down Docker Compose services..."
  docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2>/dev/null || true
  log_info "Cleanup complete."
}

# Always clean up on exit
trap cleanup EXIT

# =============================================================================
# Test 1: Docker Compose starts all services in ≤120s
# =============================================================================

test_services_start() {
  log_info "Starting Docker Compose services..."
  docker compose -f "$COMPOSE_FILE" up -d --build

  log_info "Waiting for all services to become healthy (max ${MAX_WAIT_SECONDS}s)..."

  local elapsed=0
  local all_healthy=false

  while [ $elapsed -lt $MAX_WAIT_SECONDS ]; do
    # Check if colyseus is healthy (it has a healthcheck defined)
    local colyseus_status
    colyseus_status=$(docker inspect --format='{{.State.Health.Status}}' 7gather-colyseus 2>/dev/null || echo "not_found")

    # Check if other containers are running
    local livekit_status
    livekit_status=$(docker inspect --format='{{.State.Status}}' 7gather-livekit 2>/dev/null || echo "not_found")

    local nginx_status
    nginx_status=$(docker inspect --format='{{.State.Status}}' 7gather-nginx 2>/dev/null || echo "not_found")

    local client_status
    client_status=$(docker inspect --format='{{.State.Status}}' 7gather-client 2>/dev/null || echo "not_found")

    log_info "  [${elapsed}s] colyseus=${colyseus_status} livekit=${livekit_status} nginx=${nginx_status} client=${client_status}"

    if [ "$colyseus_status" = "healthy" ] && \
       [ "$livekit_status" = "running" ] && \
       [ "$nginx_status" = "running" ] && \
       [ "$client_status" = "running" ]; then
      all_healthy=true
      break
    fi

    sleep $POLL_INTERVAL
    elapsed=$((elapsed + POLL_INTERVAL))
  done

  if [ "$all_healthy" = true ]; then
    log_pass "All services started and healthy in ${elapsed}s (limit: ${MAX_WAIT_SECONDS}s)"
  else
    log_fail "Services did not become healthy within ${MAX_WAIT_SECONDS}s"
    docker compose -f "$COMPOSE_FILE" logs --tail=50
    return 1
  fi
}

# =============================================================================
# Test 2: Colyseus healthcheck returns 200
# =============================================================================

test_colyseus_healthcheck() {
  log_info "Testing Colyseus healthcheck endpoint..."

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$COLYSEUS_HEALTH_URL" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ]; then
    log_pass "Colyseus healthcheck returned HTTP 200"
  else
    log_fail "Colyseus healthcheck returned HTTP ${http_code} (expected 200)"
    return 1
  fi
}

# =============================================================================
# Test 3: WebSocket connection through Nginx proxy
# =============================================================================

test_websocket_through_nginx() {
  log_info "Testing WebSocket connection through Nginx proxy..."

  # Test WebSocket upgrade via curl
  # We expect a 101 Switching Protocols response for a valid WS upgrade
  local ws_response
  ws_response=$(curl -s -o /dev/null -w "%{http_code}" \
    --http1.1 \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Sec-WebSocket-Version: 13" \
    "http://localhost:80/colyseus/" 2>/dev/null || echo "000")

  # Colyseus may return 101 (upgrade successful) or 400 (bad request if no valid room path)
  # Both indicate that Nginx is forwarding correctly to Colyseus
  if [ "$ws_response" = "101" ] || [ "$ws_response" = "426" ] || [ "$ws_response" = "400" ]; then
    log_pass "WebSocket connection through Nginx proxy working (HTTP ${ws_response})"
  else
    # Alternative: try direct Colyseus WebSocket to confirm it's a proxy issue
    local direct_ws
    direct_ws=$(curl -s -o /dev/null -w "%{http_code}" \
      --http1.1 \
      -H "Upgrade: websocket" \
      -H "Connection: Upgrade" \
      -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
      -H "Sec-WebSocket-Version: 13" \
      "$COLYSEUS_WS_URL" 2>/dev/null || echo "000")

    if [ "$direct_ws" = "101" ] || [ "$direct_ws" = "400" ]; then
      log_fail "WebSocket works directly (HTTP ${direct_ws}) but NOT through Nginx (HTTP ${ws_response})"
    else
      log_fail "WebSocket connection failed both through Nginx (HTTP ${ws_response}) and directly (HTTP ${direct_ws})"
    fi
    return 1
  fi
}

# =============================================================================
# Test 4: Nginx HTTP redirect (bonus check for Requirement 10.2)
# =============================================================================

test_nginx_accessible() {
  log_info "Testing Nginx is accessible on port 80..."

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$NGINX_HTTP_URL" 2>/dev/null || echo "000")

  # Nginx Proxy Manager shows admin panel or redirects
  if [ "$http_code" != "000" ]; then
    log_pass "Nginx is accessible on port 80 (HTTP ${http_code})"
  else
    log_fail "Nginx is not accessible on port 80"
    return 1
  fi
}

# =============================================================================
# Test 5: Container restart policy check
# =============================================================================

test_restart_policy() {
  log_info "Testing container restart policies..."

  local colyseus_restart
  colyseus_restart=$(docker inspect --format='{{.HostConfig.RestartPolicy.Name}}' 7gather-colyseus 2>/dev/null || echo "unknown")

  local livekit_restart
  livekit_restart=$(docker inspect --format='{{.HostConfig.RestartPolicy.Name}}' 7gather-livekit 2>/dev/null || echo "unknown")

  local nginx_restart
  nginx_restart=$(docker inspect --format='{{.HostConfig.RestartPolicy.Name}}' 7gather-nginx 2>/dev/null || echo "unknown")

  if [ "$colyseus_restart" = "unless-stopped" ] && \
     [ "$livekit_restart" = "unless-stopped" ] && \
     [ "$nginx_restart" = "unless-stopped" ]; then
    log_pass "All containers have restart policy 'unless-stopped'"
  else
    log_fail "Restart policies: colyseus=${colyseus_restart}, livekit=${livekit_restart}, nginx=${nginx_restart}"
    return 1
  fi
}

# =============================================================================
# Main execution
# =============================================================================

main() {
  echo "============================================================================="
  echo " 7Gather - Docker Compose Integration Tests"
  echo "============================================================================="
  echo ""

  # Run tests in sequence (later tests depend on services being up)
  test_services_start || true
  test_colyseus_healthcheck || true
  test_websocket_through_nginx || true
  test_nginx_accessible || true
  test_restart_policy || true

  echo ""
  echo "============================================================================="
  echo " Results: ${TESTS_PASSED} passed, ${TESTS_FAILED} failed"
  echo "============================================================================="

  if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
  fi
}

main "$@"
