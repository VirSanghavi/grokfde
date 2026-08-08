#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"

echo "== health =="
curl -sf "$BASE/api/health" >/dev/null

echo "== create company =="
COMPANY=$(curl -sf -X POST "$BASE/api/company" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Grok FDE","slug":"grok-fde-smoke-'"$(date +%s)"'","agentName":"Atlas"}')
COMPANY_ID=$(echo "$COMPANY" | python3 -c "import sys,json; print(json.load(sys.stdin)['company']['id'])")
echo "company=$COMPANY_ID"

echo "== paste knowledge =="
curl -sf -X POST "$BASE/api/knowledge/paste" \
  -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$COMPANY_ID\",\"title\":\"Overview\",\"content\":\"Grok FDE is an AI Forward-Deployed Engineer. Channels: chat, email, voice. Memory is persistent. MCP enables create_sandbox. Integrates with Kubernetes, AWS, Salesforce. Never fabricates HIPAA claims.\"}" >/dev/null

echo "== demo mcp =="
curl -sf -X POST "$BASE/api/mcp" \
  -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$COMPANY_ID\",\"label\":\"Demo\",\"serverUrl\":\"demo://grok-fde\",\"allowWrite\":true}" >/dev/null

echo "== session =="
SESSION=$(curl -sf -X POST "$BASE/api/conversations" \
  -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$COMPANY_ID\",\"companyName\":\"Globex\",\"personName\":\"Judge\"}")
CONV_ID=$(echo "$SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin)['conversation']['id'])")

echo "== chat 1 =="
R1=$(curl -sf -X POST "$BASE/api/conversations/$CONV_ID/message" \
  -H 'Content-Type: application/json' \
  -d '{"message":"We use Kubernetes on AWS. Could Grok FDE fit into our workflow?"}')
echo "$R1" | python3 -c "import sys,json; d=json.load(sys.stdin); print('stack', d['prospect'].get('currentStack')); print('preview', d['message']['content'][:120])"

echo "== chat 2 =="
curl -sf -X POST "$BASE/api/conversations/$CONV_ID/message" \
  -H 'Content-Type: application/json' \
  -d '{"message":"What would you recommend given our current stack?"}' >/dev/null

echo "== voice token =="
curl -sf "$BASE/api/voice/token?conversationId=$CONV_ID" >/dev/null || echo "(voice token requires XAI_API_KEY — skipped soft)"

echo "== call complete =="
curl -sf -X POST "$BASE/api/calls/complete" \
  -H 'Content-Type: application/json' \
  -d "{\"conversationId\":\"$CONV_ID\",\"transcript\":\"We also use Salesforce and want sandboxes via MCP.\"}" >/dev/null

echo "== architecture =="
curl -sf -X POST "$BASE/api/assets/architecture" \
  -H 'Content-Type: application/json' \
  -d "{\"conversationId\":\"$CONV_ID\"}" >/dev/null

echo "SMOKE OK conv=$CONV_ID"
