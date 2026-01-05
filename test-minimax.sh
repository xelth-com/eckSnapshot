#!/bin/bash
# MiniMax Integration Test Script
# Tests both Supervisor-Worker and Standalone modes

echo "🧪 MiniMax Integration Test"
echo "================================"
echo ""

# Test 1: Check API Key
echo "1️⃣ Checking MINIMAX_API_KEY..."
if [ -z "$MINIMAX_API_KEY" ]; then
  echo "   ❌ MINIMAX_API_KEY not set"
  echo "   Run: source ~/.bashrc"
  exit 1
else
  echo "   ✅ Key found: ${MINIMAX_API_KEY:0:20}..."
fi
echo ""

# Test 2: Check MCP Server
echo "2️⃣ Checking MCP Server status..."
MCP_STATUS=$(claude mcp list 2>&1 | grep minimax-worker)
if echo "$MCP_STATUS" | grep -q "Connected"; then
  echo "   ✅ MCP Server: Connected"
else
  echo "   ⚠️  MCP Server: Not connected or needs restart"
  echo "   $MCP_STATUS"
fi
echo ""

# Test 3: Check minimax alias
echo "3️⃣ Checking 'minimax' alias..."
if type minimax &>/dev/null; then
  echo "   ✅ Alias configured"
else
  echo "   ❌ Alias not found"
  echo "   Run: source ~/.bashrc"
fi
echo ""

# Test 4: Test Standalone Mode
echo "4️⃣ Testing Standalone Mode..."
echo "   Running: minimax 'Say hello in Russian'"
RESULT=$(MINIMAX_API_KEY="$MINIMAX_API_KEY" \
  ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic" \
  ANTHROPIC_AUTH_TOKEN="$MINIMAX_API_KEY" \
  ANTHROPIC_MODEL="MiniMax-M2.1" \
  claude "Say hello in Russian" 2>&1)

if [ $? -eq 0 ]; then
  echo "   ✅ Standalone mode works!"
  echo "   Response: $RESULT"
else
  echo "   ❌ Failed: $RESULT"
fi
echo ""

echo "================================"
echo "✨ Test Complete!"
echo ""
echo "Next steps:"
echo "  - Restart Claude Code to use MCP workers"
echo "  - Use 'minimax' command for standalone mode"
echo "  - Check docs: docs/minimax-standalone-setup.md"
