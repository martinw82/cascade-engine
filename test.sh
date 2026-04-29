#!/bin/bash

# Cascade Master Test Suite
# Validates installation and functionality

set -e

echo "🧪 Running Cascade Master Test Suite..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0

run_test() {
    local test_name="$1"
    local test_cmd="$2"

    echo -n "Testing $test_name... "
    TESTS_RUN=$((TESTS_RUN + 1))

    if eval "$test_cmd" > /tmp/test_output.log 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "  Output: $(cat /tmp/test_output.log)"
    fi
}

# Check if server is running
echo "🔍 Checking server status..."
if pgrep -f "cascade-master\|bun.*index.ts" > /dev/null; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${YELLOW}⚠️  Server not running, starting for tests...${NC}"
    PORT=3001 bun src/server/index.ts > /tmp/server.log 2>&1 &
    SERVER_PID=$!
    sleep 3

    # Cleanup function
    cleanup() {
        if [ ! -z "$SERVER_PID" ]; then
            kill $SERVER_PID 2>/dev/null || true
        fi
    }
    trap cleanup EXIT
fi

# Run tests
echo ""
echo "🧪 Running Functional Tests..."

run_test "Health Check" "curl -s http://localhost:3001/health | grep -q 'ok'"
run_test "API Info" "curl -s http://localhost:3001/api/cascade | grep -q 'Cascade Master API'"
run_test "Metrics Endpoint" "curl -s http://localhost:3001/api/metrics | grep -q 'total_requests'"
run_test "Config Backup" "curl -s http://localhost:3001/api/config/backup | grep -q 'timestamp'"

# Test cascade API (should work without auth in development)
run_test "Cascade API (Basic)" "curl -s -X POST http://localhost:3001/api/cascade -H 'Content-Type: application/json' -d '{\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}' | grep -q 'chat.completion'"

# Test input validation
run_test "Input Validation (Invalid)" "curl -s -X POST http://localhost:3001/api/cascade -H 'Content-Type: application/json' -d '{}' | grep -q 'Messages array required'"

# Test keyword detection
run_test "Keyword Detection (Coding)" "curl -s -X POST http://localhost:3001/api/cascade -H 'Content-Type: application/json' -d '{\"messages\":[{\"role\":\"user\",\"content\":\"Can you debug this Python function?\"}]}' | grep -q 'task type: coding'"

run_test "Keyword Detection (Summarization)" "curl -s -X POST http://localhost:3001/api/cascade -H 'Content-Type: application/json' -d '{\"messages\":[{\"role\":\"user\",\"content\":\"Please summarize this document\"}]}' | grep -q 'task type: summarization'"

echo ""
echo "📊 Test Results: $TESTS_PASSED/$TESTS_RUN tests passed"

if [ $TESTS_PASSED -eq $TESTS_RUN ]; then
    echo -e "${GREEN}🎉 All tests passed! Cascade Master is working correctly.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Check the output above for details.${NC}"
    exit 1
fi