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
    NODE_ENV=development PORT=3001 bun src/server/index.ts > /tmp/server.log 2>&1 &
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
run_test "API Info" "curl -s -H 'x-internal: true' http://localhost:3001/api/cascade | grep -q 'Cascade Master API'"
run_test "Metrics Endpoint" "curl -s -H 'x-internal: true' http://localhost:3001/api/metrics | grep -q 'total_requests'"
run_test "Config Backup" "curl -s -H 'x-internal: true' http://localhost:3001/api/config/backup | grep -q 'timestamp'"

# Test input validation - should reject invalid requests quickly (no LLM call needed)
run_test "Input Validation (Empty Body)" "curl -s -X POST -H 'x-internal: true' http://localhost:3001/api/cascade -H 'Content-Type: application/json' -d '{}' | grep -q 'required'"
run_test "Input Validation (Missing Messages)" "curl -s -X POST -H 'x-internal: true' http://localhost:3001/api/cascade -H 'Content-Type: application/json' -d '{\"model\":\"test\"}' | grep -q 'required'"
run_test "Input Validation (Invalid Role)" "curl -s -X POST -H 'x-internal: true' http://localhost:3001/api/cascade -H 'Content-Type: application/json' -d '{\"messages\":[{\"role\":\"invalid\",\"content\":\"test\"}]}' | grep -q 'allowed'"

# Test auth - should reject without API key (when not x-internal)
run_test "Auth Required (No Key)" "curl -s -X POST http://localhost:3001/api/cascade -H 'Content-Type: application/json' -d '{\"messages\":[{\"role\":\"user\",\"content\":\"test\"}]}' | grep -q 'Authentication required'"

# Test providers CRUD
run_test "List Providers" "curl -s -H 'x-internal: true' http://localhost:3001/api/providers | grep -qE 'id|\[\]'"
run_test "Create Provider" "curl -s -X POST -H 'x-internal: true' http://localhost:3001/api/providers -H 'Content-Type: application/json' -d '{\"id\":\"test-provider\",\"name\":\"Test\",\"base_url\":\"https://example.com/v1\",\"api_key\":\"test-key\"}' | grep -q 'test-provider'"
run_test "Provider API Key Redacted" "curl -s -H 'x-internal: true' http://localhost:3001/api/providers | grep -q 'REDACTED'"

# Test models CRUD
run_test "List Models" "curl -s -H 'x-internal: true' http://localhost:3001/api/models | grep -qE 'id|\[\]'"
run_test "Create Model" "curl -s -X POST -H 'x-internal: true' http://localhost:3001/api/models -H 'Content-Type: application/json' -d '{\"id\":\"test-model\",\"providerId\":\"test-provider\",\"modelId\":\"test-model-v1\"}' | grep -q 'test-model'"

# Test cascade rules CRUD
run_test "List Cascade Rules" "curl -s -H 'x-internal: true' http://localhost:3001/api/cascade-rules | grep -qE 'id|\[\]'"
run_test "Create Cascade Rule (Valid)" "curl -s -X POST -H 'x-internal: true' http://localhost:3001/api/cascade-rules -H 'Content-Type: application/json' -d '{\"id\":\"test-rule\",\"name\":\"Test Rule\",\"priority\":1,\"triggerType\":\"keyword\",\"triggerValue\":\"test\",\"modelOrder\":[\"test-model\"],\"wordLimit\":5,\"enabled\":true}' | grep -q 'test-rule'"
run_test "Create Cascade Rule (Invalid - no name)" "curl -s -X POST -H 'x-internal: true' http://localhost:3001/api/cascade-rules -H 'Content-Type: application/json' -d '{\"priority\":1}' | grep -q 'Invalid name'"
run_test "Create Cascade Rule (Invalid - bad priority)" "curl -s -X POST -H 'x-internal: true' http://localhost:3001/api/cascade-rules -H 'Content-Type: application/json' -d '{\"name\":\"Test\",\"priority\":9999,\"triggerType\":\"keyword\",\"triggerValue\":\"test\",\"modelOrder\":[]}' | grep -q 'Invalid priority'"

# Test auth keys CRUD
run_test "List Auth Keys" "curl -s -H 'x-internal: true' http://localhost:3001/api/auth-keys | grep -q 'id'"
run_test "Create Auth Key" "curl -s -X POST -H 'x-internal: true' http://localhost:3001/api/auth-keys -H 'Content-Type: application/json' -d '{\"id\":\"test-key\",\"name\":\"Test Key\"}' | grep -q 'cm-'"
run_test "Auth Key Redacted in List" "curl -s -H 'x-internal: true' http://localhost:3001/api/auth-keys | grep -q 'REDACTED'"

# Test security headers
run_test "Security Header (X-Content-Type-Options)" "curl -s -I http://localhost:3001/health | grep -qi 'X-Content-Type-Options: nosniff'"
run_test "Security Header (X-Frame-Options)" "curl -s -I http://localhost:3001/health | grep -qi 'X-Frame-Options: DENY'"
run_test "Security Header (Referrer-Policy)" "curl -s -I http://localhost:3001/health | grep -qi 'Referrer-Policy'"

# Test validate-key endpoint
run_test "Validate Key (Missing)" "curl -s -X POST http://localhost:3001/api/validate-key | grep -q 'X-API-Key header is required'"
run_test "Validate Key (Invalid)" "curl -s -X POST -H 'x-api-key: invalid-key' http://localhost:3001/api/validate-key | grep -q 'Invalid API key'"

# Cleanup test data
curl -s -X DELETE -H 'x-internal: true' http://localhost:3001/api/models/provider/test-provider > /dev/null 2>&1 || true
curl -s -X DELETE -H 'x-internal: true' http://localhost:3001/api/providers/test-provider > /dev/null 2>&1 || true
curl -s -X DELETE -H 'x-internal: true' -H 'Content-Type: application/json' -d '{"id":"test-rule"}' http://localhost:3001/api/cascade-rules > /dev/null 2>&1 || true
curl -s -X DELETE -H 'x-internal: true' http://localhost:3001/api/auth-keys/test-key > /dev/null 2>&1 || true

echo ""
echo "📊 Test Results: $TESTS_PASSED/$TESTS_RUN tests passed"

if [ $TESTS_PASSED -eq $TESTS_RUN ]; then
    echo -e "${GREEN}🎉 All tests passed! Cascade Master is working correctly.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Check the output above for details.${NC}"
    exit 1
fi
