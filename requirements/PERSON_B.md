# Person B — Intelligence & Server System

You are PERSON B building one half of a hackathon product called Grok FDE.

You are working in parallel with PERSON A.

Both of you start from the exact same initialized Git repository on separate branches.

You will each submit exactly one pull request.

Your job is to build the COMPLETE INTELLIGENCE AND SERVER-SIDE SYSTEM behind the product:

- Supabase database schema
- Grok/xAI integration
- company knowledge ingestion
- xAI Files/Collections integration
- company understanding
- prospect memory
- technical chat agent
- MCP tools
- permission handling
- Grok Voice session credentials/context
- call transcript processing
- architecture generation
- optional Grok Imagine generation
- human escalation
- optional email channel
- server-side API routes

PERSON A independently owns all UI, frontend components, root project setup, package.json, public/product screens, mock mode, and browser-side product experience.

You should be able to fully test your half through HTTP requests without PERSON A's frontend.

==================================================
PRODUCT CONTEXT
==================================================

The product is called:

GROK FDE

Tagline:

Every prospect gets an engineer.

The problem:

Highly technical companies have a bottleneck between sales and engineering.

Salespeople can talk to customers but often cannot answer deep implementation questions.

Engineers understand the product but cannot join every sales call.

Forward-deployed engineers / solutions engineers bridge that gap, but they are expensive and cannot scale infinitely.

Grok FDE gives a company an AI Forward-Deployed Engineer.

The company provides:

- product docs
- API docs
- architecture docs
- pricing
- security docs
- case studies
- implementation guides
- sales playbooks
- pasted text
- URLs
- optional MCP servers exposing real company tools

Grok learns the company.

Each prospect can then interact with the same persistent AI FDE through:

- chat
- email
- realtime voice calls

The FDE has persistent prospect memory across channels.

Example:

Prospect says in chat:

"We run Kubernetes on AWS."

Later they click CALL.

The Grok Voice agent should already know:

- Kubernetes
- AWS
- prior technical discussion
- unanswered questions
- deal stage

and naturally respond based on it.

This cross-channel memory is one of the primary magic moments.

The FDE can:

- answer technical questions
- search company documentation
- discover prospect requirements
- understand technical architecture
- explain integrations
- recommend implementation approaches
- invoke company tools through MCP
- create sandboxes or estimates where permitted
- generate architecture plans
- generate custom technical collateral
- escalate when company documentation is insufficient
- optionally use Grok Imagine
- optionally communicate by email

This is NOT:

- a support bot
- a FAQ chatbot
- a generic sales SDR
- a simple RAG app

The objective is for prospects to feel like they have immediate access to a competent technical engineer.

==================================================
DEMO CONTEXT
==================================================

The strongest hackathon demo uses Grok FDE to sell Grok FDE itself.

We upload this product's own documentation.

A judge becomes a prospect.

Judge asks:

"What do you do?"

FDE explains.

Judge says:

"We use Kubernetes on AWS."

That becomes persistent prospect memory.

Judge clicks CALL.

Voice agent says something like:

"Since you mentioned you're already using Kubernetes on AWS..."

Then the FDE can:

- search docs
- invoke a demo MCP tool
- generate an architecture
- explain implementation

The audience should think:

"This is an employee, not a chatbot."

==================================================
TECH STACK
==================================================

The entire app is one Next.js application.

Use:

- Next.js App Router
- TypeScript
- Supabase
- Vercel
- Grok/xAI for all intelligence

Do not add unnecessary infrastructure.

Avoid:

- LangChain
- LlamaIndex
- Pinecone
- Redis
- queues
- microservices
- custom vector DB
- unnecessary agent frameworks

Use xAI's native capabilities wherever possible.

The intended architecture is:

Next.js
+
Supabase
+
xAI
+
Vercel

PERSON A owns package.json.

You must NOT edit package.json.

Prefer native fetch against xAI APIs.

Zod should already be available and may be used heavily.

==================================================
STRICT FILE OWNERSHIP
==================================================

YOU MAY MODIFY:

/src/app/api/**
/src/lib/ai/**
/src/lib/server/**
/src/lib/email/**
/supabase/**
/docs/**

YOU MUST NOT MODIFY:

/package.json
/package-lock.json
/README.md
/.env.example

/src/components/**
/src/styles/**
/src/app/(marketing)/**
/src/app/(company)/**
/src/app/(prospect)/**
/src/lib/mock/**
/src/types/ui.ts

Those belong to PERSON A.

Do not modify PERSON A's files even if it would make your implementation easier.

==================================================
HIGH-LEVEL SERVER ARCHITECTURE
==================================================

Suggested structure:

src/
  app/
    api/
      company/
      knowledge/
        upload/
        paste/
        url/
      mcp/
      conversations/
        [id]/
          message/
      prospects/
        [id]/
      voice/
        token/
      calls/
        complete/
      assets/
        architecture/
        image/
        video/
      email/
        inbound/
        send/

  lib/
    ai/
      grok.ts
      prompts/
        fde.ts
        company-extraction.ts
        prospect-memory.ts
        architecture.ts
        call-summary.ts

    server/
      supabase-admin.ts
      company-context.ts
      prospect-context.ts
      knowledge.ts
      mcp.ts
      permissions.ts
      errors.ts

    email/
      inbound.ts
      outbound.ts

supabase/
  migrations/

docs/
  API.md
  test-requests.md

Adjust internally as appropriate, but preserve ownership boundaries.

==================================================
SUPABASE DATABASE
==================================================

Create migrations.

Tables:

companies
knowledge_sources
mcp_servers
prospects
conversations
messages
calls
generated_assets
escalations

Potential additional tables are acceptable if genuinely useful, but avoid unnecessary schema complexity.

--------------------------------
companies
--------------------------------

id
name
slug
description
agent_name
agent_voice
xai_collection_id
knowledge_summary_json
created_at
updated_at

--------------------------------
knowledge_sources
--------------------------------

id
company_id
type
title
source_url
xai_file_id
status
metadata_json
created_at

type values:

file
paste
url

status:

processing
ready
error

--------------------------------
mcp_servers
--------------------------------

id
company_id
label
server_url
encrypted_auth or auth metadata
allow_write
enabled
metadata_json
created_at

Do not expose credentials client-side.

--------------------------------
prospects
--------------------------------

id
company_id
company_name
person_name
email
stage
memory_json
created_at
updated_at

--------------------------------
conversations
--------------------------------

id
company_id
prospect_id
created_at
updated_at

--------------------------------
messages
--------------------------------

id
conversation_id
channel
role
content
metadata_json
created_at

channel values:

chat
email
call
system

--------------------------------
calls
--------------------------------

id
conversation_id
started_at
ended_at
transcript
summary_json

--------------------------------
generated_assets
--------------------------------

id
conversation_id
type
content_json or URL
prompt
created_at

--------------------------------
escalations
--------------------------------

id
company_id
prospect_id
conversation_id
question
reason
priority
status
created_at
resolved_at

==================================================
SUPABASE SERVER CLIENT
==================================================

Create a service-role server-only Supabase helper inside your owned paths.

Do not use the service role in browser code.

All sensitive writes and secret retrieval happen server-side.

==================================================
XAI WRAPPER
==================================================

Create:

/src/lib/ai/grok.ts

All direct calls to xAI should go through this wrapper.

Provide clean functions such as:

askGrok()
askGrokStructured()
askGrokWithKnowledge()
askGrokWithTools()
generateImage()
generateVideo()

Use environment-driven model IDs.

Do not scatter model names throughout the code.

Expected env names:

XAI_API_KEY
XAI_TEXT_MODEL
XAI_VOICE_MODEL
XAI_IMAGE_MODEL
XAI_VIDEO_MODEL

Use Zod or JSON Schema validation for structured outputs.

Retries should be conservative.

Return useful server-side errors.

==================================================
FDE AGENT IDENTITY
==================================================

Create the primary FDE system behavior.

The FDE is a hybrid of:

- forward-deployed engineer
- solutions architect
- technical salesperson
- implementation engineer

PRIMARY OBJECTIVE:

Help a prospect determine whether and how the company's product solves their problem.

The FDE should:

- understand company documentation deeply
- answer technical questions concretely
- discover prospect requirements naturally
- understand their current stack
- identify constraints
- explain implementation
- produce architectures
- use tools when helpful
- make reasonable recommendations
- remember prior interactions
- continue context across channels
- guide the prospect toward useful next actions
- distinguish facts from assumptions
- admit uncertainty

The FDE must NEVER:

- fabricate features
- fabricate integrations
- fabricate pricing
- fabricate security/compliance claims
- fabricate contractual commitments
- claim an MCP tool succeeded if it failed
- claim company docs support something they do not
- hide meaningful uncertainty

If company knowledge cannot answer something:

1. say that clearly,
2. optionally search permitted sources,
3. if still unresolved, create an escalation.

Do not turn every answer into a hard sell.

Strong technical credibility is more important than pushiness.

==================================================
COMPANY CREATION
==================================================

Implement:

POST /api/company

Input conceptually:

{
  "name": "Grok FDE",
  "slug": "grok-fde",
  "agentName": "Atlas"
}

Flow:

1. create Supabase company
2. create xAI Collection if using Collections
3. save collection ID
4. return company

If Collection creation fails, fail clearly.

==================================================
KNOWLEDGE INGESTION PRINCIPLE
==================================================

Do NOT build a custom RAG pipeline unless absolutely necessary.

Use xAI Files / document capabilities / Collections for persistent company knowledge.

Supabase stores:

- metadata
- app state
- extracted high-level knowledge summaries

xAI stores/searches the underlying company knowledge corpus.

Every ingestion should do two things:

1. make the raw source available to Grok retrieval
2. extract useful structured company-level knowledge

==================================================
FILE UPLOAD
==================================================

Implement:

POST /api/knowledge/upload

Flow:

receive file
↓
create knowledge_source status=processing
↓
upload to xAI
↓
add to company knowledge collection
↓
run structured company extraction
↓
merge extracted facts
↓
mark source ready
↓
return source

On failure:

status=error

Do not leave ambiguous processing records.

==================================================
PASTE INGESTION
==================================================

Implement:

POST /api/knowledge/paste

Input:

{
  "companyId": "...",
  "title": "Pricing",
  "content": "..."
}

Convert content into something xAI retrieval can persist.

Add to company collection.

Run structured extraction.

Save source metadata.

==================================================
URL INGESTION
==================================================

This is lower priority than upload/paste.

Implement if time permits:

POST /api/knowledge/url

Only fetch a single URL.

Do not build a crawler.

Extract meaningful page text.

Remove obvious navigation/HTML noise.

Add to knowledge collection.

==================================================
COMPANY KNOWLEDGE EXTRACTION
==================================================

After ingestion, use Grok structured output to extract facts such as:

{
  "products": [],
  "capabilities": [],
  "useCases": [],
  "integrations": [],
  "technicalFacts": [],
  "pricingFacts": [],
  "securityFacts": [],
  "implementationFacts": [],
  "commonObjections": [],
  "buyerTypes": []
}

Merge this into:

companies.knowledge_summary_json

Do not blindly replace existing knowledge with empty arrays.

Prefer additive/deduplicating merges.

The high-level summary is fast context.

The Collection remains the detailed source of truth.

==================================================
PROSPECT CREATION
==================================================

Provide a sensible way to create or lazily create a prospect/conversation.

The exact endpoint structure can be simple.

A public FDE page should ultimately be able to obtain:

company
prospect
conversation

without complex setup.

If no prospect ID exists, create an anonymous prospect/conversation and update it later when name/email is known.

==================================================
CHAT ENDPOINT
==================================================

Implement:

POST /api/conversations/[id]/message

Request:

{
  "message": "Could this work with Kubernetes?"
}

Load:

1. company
2. company knowledge summary
3. prospect memory
4. recent messages
5. relevant xAI Collection knowledge
6. configured MCP tools

Then ask Grok.

Persist user message.

Persist assistant message.

Update prospect memory.

Return exactly the frontend-friendly structure below.

{
  "message": {
    "id": "msg_123",
    "role": "assistant",
    "content": "Yes...",
    "createdAt": "2026-08-08T12:00:00Z"
  },
  "prospect": {
    "stage": "technical-evaluation",
    "summary": "Runs Kubernetes on AWS.",
    "currentStack": ["Kubernetes", "AWS"],
    "painPoints": [],
    "requirements": [],
    "objections": [],
    "nextAction": ""
  },
  "events": [
    {
      "type": "searching_knowledge",
      "label": "Searching deployment documentation"
    }
  ]
}

Do not break this response shape.

You may add optional fields.

==================================================
PROSPECT MEMORY
==================================================

After meaningful interactions, use Grok structured output to update persistent memory.

Schema:

{
  "currentStack": [],
  "painPoints": [],
  "requirements": [],
  "technicalQuestions": [],
  "objections": [],
  "competitors": [],
  "commitments": [],
  "unresolvedQuestions": [],
  "nextAction": "",
  "stage": "",
  "summary": ""
}

Important:

MERGE memory intelligently.

Do not erase existing useful facts because a later model output omits them.

Example:

Existing:

currentStack:
["AWS", "Kubernetes"]

New message only reveals:
"Needs US data residency."

Final memory must preserve:

AWS
Kubernetes
US data residency

==================================================
CONTEXT LOADING
==================================================

Do NOT stuff the complete historical transcript into every model call.

Load:

- company summary
- prospect structured memory
- recent messages
- relevant knowledge retrieval

This should be enough.

You may store an evolving conversation summary if helpful.

==================================================
AGENT EVENTS
==================================================

Return operational activity suitable for display.

Supported types:

searching_knowledge
searching_web
using_tool
generating_image
prospect_updated
needs_human

Shape:

{
  "type": "using_tool",
  "label": "Using estimate_cost"
}

Do not expose hidden reasoning or chain-of-thought.

==================================================
MCP
==================================================

MCP is a major product differentiator.

The company can connect a remote MCP server.

Implement:

POST /api/mcp

Input:

{
  "companyId": "...",
  "label": "Internal Platform",
  "serverUrl": "...",
  "auth": "...",
  "allowWrite": false
}

Store credentials securely server-side.

Never return secrets to the frontend.

Discover tools if feasible.

Return metadata such as:

{
  "tools": [
    {
      "name": "create_sandbox",
      "description": "Create a trial environment"
    },
    {
      "name": "estimate_cost",
      "description": "Estimate customer cost"
    }
  ]
}

==================================================
MCP PERMISSIONS
==================================================

Classify tools conceptually:

READ
WRITE
HIGH_RISK

Examples:

get_project
→ READ

estimate_cost
→ READ

create_sandbox
→ WRITE

delete_project
→ HIGH_RISK

Policy:

READ tools:
may run automatically.

WRITE tools:
should generally require explicit user/prospect confirmation unless company has allowed trusted automatic usage.

HIGH_RISK:
never automatically execute during a prospect conversation.

If xAI's MCP interface itself does not expose perfect metadata, create a simple local policy layer.

Safety and truthful execution matter.

==================================================
MCP TOOL USAGE
==================================================

The FDE should be able to turn a technical sales conversation into action.

Example:

Prospect:
"Can you make me a sandbox?"

FDE:
"Sure. What should I call it?"

Prospect:
"globex-test"

Then, after appropriate confirmation:

create_sandbox({
  name: "globex-test"
})

FDE should only say it was created if the tool actually reports success.

This is one of the best demo moments.

If no real MCP server is available, build a small demo/mock tool integration server-side that exercises the same behavior without requiring PERSON A changes.

==================================================
VOICE
==================================================

Implement:

GET /api/voice/token

The goal is browser-direct realtime Grok Voice.

Do NOT proxy raw audio through Vercel if avoidable.

The server should issue an ephemeral credential/token/configuration sufficient for PERSON A's browser code to establish the realtime voice session.

Voice must receive the same conceptual identity as chat.

Context should include:

FDE name
company summary
prospect memory
recent conversation summary
company knowledge collection
available MCP tools

The voice agent should behave as the SAME FDE, not another assistant.

==================================================
CROSS-CHANNEL MEMORY
==================================================

This is a key product requirement.

Suppose chat contains:

User:
"We use Kubernetes on AWS."

Memory becomes:

currentStack:
- Kubernetes
- AWS

Then a voice session starts.

The voice session system context must contain that information.

It should naturally be able to say:

"Since you mentioned you're using Kubernetes on AWS..."

without asking the user to repeat themselves.

==================================================
CALL COMPLETION
==================================================

Implement:

POST /api/calls/complete

Input:

{
  "conversationId": "...",
  "transcript": "...",
  "startedAt": "...",
  "endedAt": "..."
}

Use Grok structured output to extract:

summary
requirements
objections
technical details
commitments
unanswered questions
next action
deal stage

Save call.

Update prospect memory.

Add a timeline/system event or message so company UI sees the call in chronology.

==================================================
ARCHITECTURE GENERATION
==================================================

Implement a reliable structured architecture generator.

This is more important than image generation.

Possible endpoint:

POST /api/assets/architecture

Input:

{
  "conversationId": "..."
}

Output:

{
  "id": "...",
  "title": "Globex + Grok FDE Architecture",
  "nodes": [
    {
      "id": "salesforce",
      "label": "Salesforce",
      "type": "system"
    },
    {
      "id": "grok-fde",
      "label": "Grok FDE",
      "type": "grok"
    }
  ],
  "edges": [
    {
      "source": "salesforce",
      "target": "grok-fde"
    }
  ],
  "summary": "..."
}

Ground architecture in:

- company capabilities
- prospect stack
- prospect requirements

Do not hallucinate unsupported integrations.

==================================================
GROK IMAGINE
==================================================

Optional but useful.

Implement:

POST /api/assets/image

Potential use cases:

- executive-friendly architecture visual
- customized technical explainer
- prospect-specific collateral

Use Grok to construct the image prompt from real product/prospect context.

If image generation fails, structured architecture should still work.

Video is lower priority.

If time remains:

POST /api/assets/video

But never sacrifice core functionality for video.

==================================================
HUMAN ESCALATION
==================================================

When the FDE cannot responsibly answer a question, create an escalation.

Example:

Prospect:
"Can you sign a HIPAA BAA?"

Company docs contain no answer.

DO NOT hallucinate.

Create:

{
  "question": "Can Grok FDE sign a HIPAA BAA?",
  "reason": "Not present in company documentation",
  "priority": "high"
}

Return a normal FDE response such as:

"I want to verify that before giving you a definitive answer. I've flagged it for the team."

Also return event:

{
  "type": "needs_human",
  "label": "Company confirmation required"
}

==================================================
EMAIL
==================================================

Email is P1, not P0.

If time allows implement:

POST /api/email/send
POST /api/email/inbound

Use simplest configured transport.

The email FDE must be the SAME identity as chat/call.

Inbound flow:

email arrives
↓
identify company
↓
identify/create prospect
↓
load prospect memory
↓
load company knowledge
↓
Grok drafts response
↓
send
↓
persist both messages

Persist channel:

email

Do not create separate channel-specific memory.

==================================================
ERROR FORMAT
==================================================

Return JSON errors.

Example:

{
  "error": {
    "code": "KNOWLEDGE_INGESTION_FAILED",
    "message": "Could not process the uploaded document.",
    "recoverable": true
  }
}

No arbitrary HTML errors.

==================================================
SECURITY PRINCIPLES
==================================================

This is a hackathon, but don't do reckless things.

- secrets stay server-side
- MCP auth never returned client-side
- service role never exposed
- validate incoming IDs
- validate structured outputs
- do not execute arbitrary model-generated code
- do not allow arbitrary destructive MCP actions
- do not claim successful actions that failed
- do not hallucinate sensitive commercial facts

==================================================
API CONTRACT WITH PERSON A
==================================================

Do not change these existing fields.

CHAT RESPONSE:

{
  "message": {
    "id": "msg_123",
    "role": "assistant",
    "content": "Yes...",
    "createdAt": "2026-08-08T12:00:00Z"
  },
  "prospect": {
    "stage": "technical-evaluation",
    "summary": "Runs Kubernetes on AWS.",
    "currentStack": ["Kubernetes", "AWS"],
    "painPoints": [],
    "requirements": [],
    "objections": [],
    "nextAction": ""
  },
  "events": [
    {
      "type": "searching_knowledge",
      "label": "Searching deployment documentation"
    }
  ]
}

KNOWLEDGE SOURCE:

{
  "id": "source_123",
  "title": "API Documentation",
  "type": "file",
  "status": "ready"
}

Allowed types:

file
paste
url
mcp

Allowed statuses:

processing
ready
error

AGENT EVENT:

{
  "type": "using_tool",
  "label": "Using estimate_cost"
}

Allowed event types:

searching_knowledge
searching_web
using_tool
generating_image
prospect_updated
needs_human

You may add optional fields.

Do not rename or remove required fields.

==================================================
TEST HARNESS
==================================================

Create:

/docs/test-requests.md

Include actual curl examples for every implemented endpoint.

The backend must be testable without any UI.

Include at minimum:

1. Create company
2. Paste company knowledge
3. Upload file
4. Create prospect/conversation
5. Send chat
6. Inspect updated prospect memory
7. Send another chat proving memory
8. Connect MCP
9. Use a safe tool
10. Request voice token
11. Complete a mock call
12. Verify memory updated
13. Generate architecture
14. Trigger human escalation

==================================================
CANONICAL TEST FLOW
==================================================

Use Grok FDE as the vendor.

Create company:

Grok FDE

Agent:

Atlas

Ingest product documentation explaining:

- companies upload docs
- AI FDE handles chat/email/calls
- memory is persistent
- MCP lets the FDE use company tools
- Grok powers the intelligence

Create prospect:

Globex

Message 1:

"We use Kubernetes on AWS. Could Grok FDE fit into our workflow?"

Expected:

- answer grounded in docs
- currentStack contains Kubernetes
- currentStack contains AWS

Message 2:

"What would you recommend given our current stack?"

Expected:

- response references Kubernetes/AWS without asking again

Then emulate call completion:

Transcript:
"We also use Salesforce and want our technical prospects to be able to create sandboxes."

Expected memory:

AWS
Kubernetes
Salesforce
interest in sandbox creation/MCP

Generate architecture.

Expected architecture includes:

Prospect channels
Grok FDE
Company knowledge
MCP tools

==================================================
PRIORITY ORDER
==================================================

Build in this order.

P0:

1. Supabase schema
2. server Supabase helper
3. xAI wrapper
4. company creation
5. paste ingestion
6. file ingestion
7. company knowledge extraction
8. prospect/conversation creation
9. chat endpoint
10. persistent prospect memory
11. voice token/context
12. call completion
13. architecture generation
14. human escalation

P1:

15. MCP connection
16. MCP tool discovery
17. tool execution
18. email
19. image generation

P2:

20. URL ingestion
21. automated web prospect research
22. video generation
23. advanced analytics

If time gets tight, preserve:

KNOWLEDGE
CHAT
MEMORY
VOICE
MCP

Those are the core product.

==================================================
DEFINITION OF DONE
==================================================

You are done when, without PERSON A's frontend, HTTP requests can demonstrate:

1. A company can be created.
2. A knowledge collection is created.
3. Pasted docs can be ingested.
4. Files can be ingested.
5. Structured company knowledge is extracted.
6. A prospect can be created.
7. A conversation can be created.
8. A chat message receives a useful grounded Grok response.
9. Prospect memory updates.
10. A second message demonstrates persistent memory.
11. An MCP server can be connected or equivalent demo tooling exists.
12. A safe tool can be used by the agent.
13. A voice credential/config can be generated.
14. Voice receives prospect/company context.
15. A completed call transcript updates prospect memory.
16. Architecture generation works.
17. Unsupported questions trigger escalation instead of hallucination.
18. API response shapes match the frozen frontend contract.

==================================================
IMPORTANT DECISION-MAKING RULE
==================================================

Do not stop to ask about small implementation details.

If the prompt leaves a minor internal choice unspecified:

make the decision yourself.

Examples:

- helper naming
- exact Zod schema organization
- table indexes
- route helper organization
- retry count
- internal context formatting
- how to deduplicate arrays

Optimize for:

- reliability
- speed
- low latency
- demo success
- truthful technical behavior
- minimal architecture
- easy merging with PERSON A

Do not gold-plate.

Do not introduce infrastructure because it is "best practice" if the product can work cleanly without it.

==================================================
FINAL PR
==================================================

Create one PR containing your entire server/intelligence implementation.

Suggested title:

feat: add Grok FDE intelligence engine

Do not edit PERSON A's files.

Do not wait for PERSON A's frontend.

Your half should work and be testable independently.
