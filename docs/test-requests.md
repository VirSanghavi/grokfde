# Part B HTTP test harness

Requires:

```bash
npm install
# set .env.local (see docs/ENV.md)
npm run dev
```

Canonical demo sells **Grok FDE** to a prospect (judge).

```bash
BASE=http://localhost:3000
```

## 1. Health

```bash
curl -s $BASE/api/health | jq
```

## 2. Create company

```bash
COMPANY=$(curl -s -X POST $BASE/api/company \
  -H 'Content-Type: application/json' \
  -d '{"name":"Grok FDE","slug":"grok-fde","agentName":"Atlas","description":"AI Forward-Deployed Engineer for technical sales"}')
echo "$COMPANY" | jq
COMPANY_ID=$(echo "$COMPANY" | jq -r .company.id)
```

## 3. Paste product knowledge

```bash
curl -s -X POST $BASE/api/knowledge/paste \
  -H 'Content-Type: application/json' \
  -d @- <<EOF | jq
{
  "companyId": "$COMPANY_ID",
  "title": "Grok FDE Product Overview",
  "content": "Grok FDE deploys an AI Forward-Deployed Engineer for technical companies.\n\nWhat we sell: A persistent AI FDE trained on company docs, pricing, security, APIs, and MCP tools. Prospects interact via chat, email, and realtime voice.\n\nPrimary buyers: AI/ML infrastructure teams, developer platform teams, technical founders selling complex B2B products.\n\nValue proposition: Every prospect gets an engineer. Train once on your company knowledge; Grok handles technical discovery, architecture, tool use, and follow-up.\n\nCapabilities:\n- Multi-channel persistent memory (chat, email, call)\n- xAI Collections knowledge search\n- Remote MCP tool execution during conversations\n- Architecture and collateral generation via Grok Imagine\n- Human escalation for legal/pricing exceptions\n\nIntegrations: Any stack that has docs or an MCP server. Works alongside Kubernetes, AWS, Salesforce, GitHub, internal platforms.\n\nSecurity: Answers only from company knowledge. Does not fabricate compliance claims. Escalates HIPAA/BAA and contractual questions.\n\nPricing: Contact sales for enterprise. Demo sandboxes available via MCP create_sandbox tool.\n\nImplementation: Upload docs → FDE ready → share /fde/{slug} with prospects → call button for voice with same memory."
}
EOF
```

## 4. Optional file upload (JSON)

```bash
curl -s -X POST $BASE/api/knowledge/upload \
  -H 'Content-Type: application/json' \
  -d "{
    \"companyId\": \"$COMPANY_ID\",
    \"title\": \"API Capabilities\",
    \"filename\": \"api.md\",
    \"content\": \"# API\\n\\nGrok FDE exposes REST under /api/* for company, knowledge, chat, voice token, MCP, assets.\\nMCP tools can create_sandbox and estimate_cost when connected.\"
  }" | jq
```

## 5. Connect demo MCP

```bash
curl -s -X POST $BASE/api/mcp \
  -H 'Content-Type: application/json' \
  -d "{
    \"companyId\": \"$COMPANY_ID\",
    \"label\": \"Grok FDE Demo Tools\",
    \"serverUrl\": \"demo://grok-fde\",
    \"allowWrite\": true
  }" | jq
```

## 6. Open prospect conversation (Globex)

```bash
SESSION=$(curl -s -X POST $BASE/api/conversations \
  -H 'Content-Type: application/json' \
  -d "{
    \"companyId\": \"$COMPANY_ID\",
    \"companyName\": \"Globex\",
    \"personName\": \"Judge\"
  }")
echo "$SESSION" | jq
CONV_ID=$(echo "$SESSION" | jq -r .conversation.id)
PROSPECT_ID=$(echo "$SESSION" | jq -r .prospect.id)
```

## 7. Chat message 1 — stack + fit

```bash
curl -s -X POST $BASE/api/conversations/$CONV_ID/message \
  -H 'Content-Type: application/json' \
  -d '{"message":"We use Kubernetes on AWS. Could Grok FDE fit into our workflow?"}' | jq
```

Expect: `prospect.currentStack` includes Kubernetes and AWS; grounded product answer.

## 8. Chat message 2 — memory continuity

```bash
curl -s -X POST $BASE/api/conversations/$CONV_ID/message \
  -H 'Content-Type: application/json' \
  -d '{"message":"What would you recommend given our current stack?"}' | jq
```

Expect: response references Kubernetes/AWS without re-asking.

## 9. Inspect prospect memory

```bash
curl -s $BASE/api/prospects/$PROSPECT_ID | jq .prospect
```

## 10. Voice token (cross-channel context)

```bash
curl -s "$BASE/api/voice/token?conversationId=$CONV_ID" | jq '{model, realtimeUrl, agent: .context.agentName, stack: .context.prospect.currentStack, instructionsPreview: .session.instructions[0:200]}'
```

Expect: instructions / context include Kubernetes + AWS.

## 11. Complete mock call

```bash
curl -s -X POST $BASE/api/calls/complete \
  -H 'Content-Type: application/json' \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"transcript\": \"Judge: We also use Salesforce and want technical prospects to create sandboxes via MCP.\\nAtlas: Perfect — since you mentioned Kubernetes on AWS earlier, we keep that layer and add Grok FDE for technical selling. I can wire create_sandbox for your team.\",
    \"startedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"endedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }" | jq
```

Expect memory includes Salesforce + sandbox interest.

## 12. Architecture

```bash
curl -s -X POST $BASE/api/assets/architecture \
  -H 'Content-Type: application/json' \
  -d "{\"conversationId\": \"$CONV_ID\"}" | jq
```

## 13. Escalation path

```bash
curl -s -X POST $BASE/api/conversations/$CONV_ID/message \
  -H 'Content-Type: application/json' \
  -d '{"message":"Can you sign a HIPAA BAA and guarantee contractual HIPAA coverage for our $120k deployment?"}' | jq
```

```bash
curl -s "$BASE/api/escalations?companyId=$COMPANY_ID" | jq
```

Expect: no fabricated HIPAA commitment; `needs_human` event and/or open escalation.

## 14. Tool action (sandbox)

```bash
curl -s -X POST $BASE/api/conversations/$CONV_ID/message \
  -H 'Content-Type: application/json' \
  -d '{"message":"Please create a sandbox named globex-test for us."}' | jq
```

Expect: `using_tool` / sandbox endpoint in reply when demo MCP connected.

## 15. Email follow-up (mock provider OK)

```bash
curl -s -X POST $BASE/api/email/send \
  -H 'Content-Type: application/json' \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"to\": \"judge@globex.example\",
    \"generate\": true,
    \"instruction\": \"Summarize architecture recommendation for their CTO.\"
  }" | jq
```

## Timeline check

```bash
curl -s $BASE/api/conversations/$CONV_ID | jq '.messages | map({channel, role, content: .content[0:80]})'
```
