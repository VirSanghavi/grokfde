# Person A — Complete Product Experience

I'm building a project, my friend. I need you to audit this PDR and the system prompt and give me a list of action items that you're going to take off of this prompt. Break it down into the tasks, phases, etc., while working as quickly as possible, because we have about a three-hour time limit to get this done. Take this and turn it into action items and really understand the product. You are PERSON A building one half of a hackathon product called Grok FDE.

You are working in parallel with another engineer, PERSON B. You both start from the exact same initialized Git repository, on separate branches, and will each merge exactly one pull request at the end.

Your job is to build the COMPLETE PRODUCT EXPERIENCE: all user-facing application surfaces, navigation, interaction design, Supabase client-side integration, mock AI behavior, call UI, knowledge onboarding UI, conversation experience, company dashboard, prospect experience, and visual polish.

PERSON B is independently building the Grok/xAI intelligence layer, server-side route handlers, Supabase migrations, MCP integration, voice token generation, knowledge ingestion, email backend, and server-side AI logic.

Your code must NOT depend on PERSON B being finished. The entire application must be usable and demoable in mock mode.

==================================================
PRODUCT CONTEXT
==================================================

The product is called:

GROK FDE

Tagline:

Every prospect gets an engineer.

Core idea:

A technical company uploads everything its forward-deployed engineers or technical salespeople need to know:

- product documentation
- API docs
- pricing
- security docs
- implementation guides
- case studies
- pitch decks
- FAQs
- architecture documentation
- pasted text
- URLs
- optionally MCP servers exposing company tools

Grok learns the company.

The company then gets a persistent AI Forward-Deployed Engineer.

This AI FDE is NOT a documentation chatbot and NOT a generic sales bot.

It behaves like a combination of:

- forward-deployed engineer
- solutions architect
- technical salesperson
- implementation engineer

Prospects can interact with the same FDE through:

- chat
- email
- live voice calls

The FDE maintains persistent memory across channels.

If a prospect tells the FDE in chat:

"We use Kubernetes on AWS."

and then presses CALL five minutes later, the voice agent should already know that and be able to say:

"Since you mentioned you're using Kubernetes on AWS..."

The company only trains the FDE once.

Every prospect then gets immediate access to a highly technical engineer without scheduling one.

The FDE can:

- answer questions from company documentation
- understand the prospect's technical environment
- discover requirements
- explain integrations
- create architecture proposals
- use company MCP tools
- generate implementation guidance
- escalate questions it cannot answer
- generate custom technical collateral
- potentially generate Grok Imagine visuals
- communicate across chat, email, and calls

The best demo is Grok FDE selling Grok FDE itself.

We upload the Grok FDE product documentation into the knowledge base.

A judge becomes the prospect.

They chat with the FDE.

They mention their stack.

They click CALL.

The FDE remembers what they said in chat.

Then the FDE can potentially use an MCP tool or generate a technical architecture.

The experience should make the judge think:

"This isn't a chatbot. This is an employee."

==================================================
PRODUCT PHILOSOPHY
==================================================

Do NOT design this like a bloated CRM.

Do NOT design it like Intercom.

Do NOT design it like a generic chatbot widget.

Do NOT build ten administrative pages nobody cares about.

The product should feel:

- extremely modern
- minimal
- technical
- expensive
- fast
- alive
- opinionated
- designed for startup/AI infrastructure companies

Think polished developer-tool aesthetic rather than traditional enterprise SaaS.

The company-side product only really needs:

1. Dashboard
2. Knowledge
3. Conversations
4. Agent/settings

The prospect experience needs:

1. Chat
2. Call
3. Rich technical artifacts

The most important UX principle:

MAKE GROK'S WORK VISIBLE.

If the FDE searches documentation, show:

Searching deployment docs...

If it invokes a tool, show:

Using estimate_cost...

If it generates something, show:

Creating architecture...

Do NOT expose chain-of-thought or hidden reasoning.

Show concise operational activity only.

==================================================
TECH STACK
==================================================

Use:

- Next.js
- App Router
- React
- TypeScript
- Tailwind CSS
- Supabase
- Vercel deployment target
- lucide-react if useful
- native browser APIs where possible

Avoid unnecessary dependencies.

PERSON B will use Grok/xAI through server routes.

You own package.json and root project setup.

PERSON B will NOT edit package.json.

Therefore add dependencies PERSON B may need up front.

At minimum include:

- next
- react
- react-dom
- typescript
- tailwindcss
- @supabase/supabase-js
- @supabase/ssr
- zod
- lucide-react

If we are using an email SDK such as Resend, include that too.

Prefer native fetch for xAI so no xAI SDK dependency is required unless clearly beneficial.

==================================================
STRICT FILE OWNERSHIP
==================================================

YOU MAY MODIFY:

/package.json
/package-lock.json
/README.md
/.env.example
/next.config.*
/tsconfig.json
/postcss.config.*
/tailwind.config.*

/src/app/(marketing)/**
/src/app/(company)/**
/src/app/(prospect)/**

/src/components/**
/src/styles/**

/src/lib/supabase/client.ts
/src/lib/supabase/server.ts

/src/lib/mock/**
/src/types/ui.ts

You MUST NOT MODIFY:

/src/app/api/**
/src/lib/ai/**
/src/lib/server/**
/src/lib/email/**
/supabase/**
/docs/**

Those belong to PERSON B.

Do not "help" PERSON B by editing those files.

The whole purpose is zero merge conflicts.

==================================================
ROOT ROUTING
==================================================

Create a clean route structure using route groups.

Suggested structure:

src/app/
  (marketing)/
    page.tsx

  (company)/
    onboarding/
      page.tsx

    dashboard/
      page.tsx

    knowledge/
      page.tsx

    conversations/
      page.tsx

    conversations/[id]/
      page.tsx

    agent/
      page.tsx

  (prospect)/
    fde/[companySlug]/
      page.tsx

    fde/[companySlug]/p/[prospectId]/
      page.tsx

You can adjust the exact layout if needed, but preserve the conceptual separation.

==================================================
DESIGN SYSTEM
==================================================

Build a polished, reusable design system.

Components should include where useful:

- Button
- IconButton
- Input
- Textarea
- Modal
- Drawer
- Badge
- StatusDot
- Tabs
- Sidebar
- TopNav
- Avatar
- EmptyState
- LoadingState
- Toast
- FileDropzone
- SourceCard
- ConversationRow
- MessageBubble
- AgentActivity
- ProspectMemoryPanel
- CallOverlay
- ArchitectureCard
- EscalationCard

Visual tone:

- dark-first
- neutral palette
- restrained use of accent color
- no rainbow gradients
- clean borders
- strong spacing
- tasteful hover states
- monospaced detail where technical
- crisp typography
- subtle animations
- minimal glassmorphism if any
- no excessive card soup

Status language should feel alive:

READY
PROCESSING
LISTENING
SEARCHING
USING TOOL
GENERATING
CONNECTED
NEEDS HUMAN

==================================================
LANDING PAGE
==================================================

Build a sharp marketing page.

Hero:

Every prospect gets an engineer.

Subheading:

Train Grok on your company once. Let every customer talk to a technical engineer instantly.

Primary CTA:

Create your FDE

Secondary CTA:

Talk to ours

Visually communicate:

KNOWLEDGE
↓
CONVERSATION
↓
ACTION

Explain the product quickly:

1. Upload your company knowledge
2. Connect your tools
3. Give prospects an always-available FDE
4. Let the same engineer follow them across chat, email, and calls

Do not overbuild the marketing site.

The real app matters more.

==================================================
COMPANY ONBOARDING
==================================================

Build onboarding.

Suggested flow:

STEP 1
Company name

STEP 2
Name your FDE

Example:
Atlas

Optional avatar/voice placeholder.

STEP 3
Teach your FDE

Four prominent options:

Upload files
Paste text
Add URL
Connect MCP

STEP 4
Learning state

Beautiful progressive status:

Uploading...
Reading...
Understanding...
Extracting technical knowledge...
Ready.

STEP 5
Show automatically inferred company understanding.

Example:

WHAT YOU SELL
AI infrastructure platform

PRIMARY BUYERS
ML engineering teams
Infrastructure teams

CORE USE CASES
GPU orchestration
Inference workloads
Multi-cloud routing

COMMON OBJECTIONS
Migration effort
Security
Cost predictability

Button:

Launch FDE

In mock mode, all of this must work.

==================================================
KNOWLEDGE PAGE
==================================================

Route:

/knowledge

Show all sources.

Example:

Product documentation          READY
API Reference                  READY
Pricing                        READY
Security whitepaper            READY
Sales playbook                 PROCESSING

Top-level actions:

+ Upload
+ Paste
+ URL
+ MCP

UPLOAD FLOW:

- drag/drop area
- file name
- upload progress
- processing state
- ready state

PASTE FLOW:

Modal:

Paste anything your FDE should know

Fields:

Title
Large textarea

Submit.

URL FLOW:

Simple URL input.

MCP FLOW:

Name
Server URL
Authorization token
Allow write actions toggle

Default "Allow write actions" to OFF.

Once MCP is connected, show tools if backend returns them.

Example:

Internal Platform

3 tools

inspect_project
create_sandbox
estimate_cost

==================================================
COMPANY DASHBOARD
==================================================

Route:

/dashboard

Keep it focused.

Metrics:

Active prospects
Conversations
Calls
Needs your help

"Needs You" should be prominent.

Example:

Globex

Question:
Can you support a custom HIPAA agreement?

Reason:
Not covered by company knowledge.

Button:
Respond

Recent conversations:

Globex        CALL       2m ago
Linear        CHAT       18m ago
Stripe        EMAIL      1h ago

FDE status:

Atlas
ONLINE

47 knowledge sources
3 MCP tools

==================================================
CONVERSATIONS
==================================================

Route:

/conversations

Build an inbox-like experience.

Left:

prospects/conversations

Right:

selected conversation

IMPORTANT:

Email, chat, and calls are NOT separate inboxes.

They all appear in one chronological timeline.

Example:

EMAIL
Aug 8, 9:03 AM

CHAT
Aug 8, 10:12 AM

CALL
Aug 8, 10:31 AM

EMAIL
Aug 8, 10:47 AM

The product should visually reinforce that this is one persistent relationship.

==================================================
PROSPECT MEMORY PANEL
==================================================

When company users inspect a prospect, show structured memory.

Example:

GLOBEX

STAGE
Technical Evaluation

STACK
AWS
Kubernetes
GitHub Actions

PAIN POINTS
GPU availability
Infrastructure cost

REQUIREMENTS
US data residency
Burst capacity

OBJECTIONS
Migration complexity

NEXT STEP
Send architecture proposal

This should be visually clean and update when API responses return newer prospect memory.

==================================================
PROSPECT CHAT EXPERIENCE
==================================================

Public route:

/fde/[companySlug]

or:

/fde/[companySlug]/p/[prospectId]

The prospect-facing UI is one of the MOST IMPORTANT screens.

Header:

Atlas
Forward-Deployed Engineer at Acme
● Online

Primary experience:

conversation

Primary actions:

Chat
Call

Potential secondary action:

Email me this

Messages should support:

- normal prose
- code
- lists
- technical artifacts
- generated architecture cards
- images
- tool activity
- links

Do not make the chat look like a customer support popup.

Make it feel like the user opened a dedicated line to a real technical engineer.

==================================================
AGENT ACTIVITY
==================================================

API responses may include events such as:

searching_knowledge
searching_web
using_tool
generating_image
prospect_updated
needs_human

Render concise activity.

Examples:

Searching deployment documentation...

Reading security documentation...

Using estimate_cost...

Researching Globex...

Generating architecture...

Do not show raw prompts.

Do not show chain-of-thought.

==================================================
CALL EXPERIENCE
==================================================

This is the hackathon magic moment.

Add a large:

Call Atlas

button.

The call interface should feel instant.

Example:

                 Atlas

              ● Connected

                04:23

            ▁▂▅▇▅▃▆▂

              End Call

Controls:

- mute
- end
- maybe speaker if useful

Below or alongside:

LIVE ACTIVITY

Searching documentation...
Using internal calculator...

PERSON B will provide an endpoint for getting a realtime Grok Voice credential.

You need to implement the browser-side connection logic once their endpoint exists.

However:

The call UI MUST be fully demonstrable in mock mode without PERSON B.

Mock mode should simulate:

Connecting...
Connected
Voice activity
Transcript updates
Context usage
Call ended
Memory extracted

==================================================
POST-CALL EXPERIENCE
==================================================

When call ends:

show duration

Then transcript

Then:

Atlas learned:

• Uses EKS
• Needs US data residency
• Evaluating 500 GPU-hours/month
• Wants implementation plan

This illustrates that calls feed persistent prospect memory.

==================================================
GENERATED ARTIFACTS
==================================================

Support rich assistant outputs.

Build reusable cards for:

- Architecture
- Implementation Plan
- Generated Image
- Proposal
- Code Example

Architecture is especially important.

Example:

Globex + Acme Architecture

GitHub Actions
      ↓
     EKS
      ↓
    Acme
   ↙    ↘
AWS GPU  GCP GPU

Person B may return structured nodes/edges.

Build a simple attractive renderer.

Do not overcomplicate with a heavy graph library unless necessary.

==================================================
HUMAN ESCALATION
==================================================

If backend says a question needs human input, prospect UI should gracefully say something like:

"I want to verify that before giving you a definitive answer. I've flagged it for the Acme team."

Company dashboard should show:

NEEDS YOU

Globex

Question:
Can Acme sign a HIPAA BAA?

Reason:
Not documented

Button:
Respond

Build the UI even if final backend support is minimal.

==================================================
SUPABASE CLIENT SETUP
==================================================

Own:

/src/lib/supabase/client.ts
/src/lib/supabase/server.ts

Set up clean browser/server Supabase clients using environment variables.

Do not create migrations.

PERSON B owns database schema.

Your frontend should gracefully tolerate mock mode with no Supabase connection.

==================================================
MOCK AI LAYER
==================================================

THIS IS CRITICAL.

Create:

/src/lib/mock/**

The entire product must be demoable when:

NEXT_PUBLIC_MOCK_AI=true

Create a clean mock abstraction so UI code does not have hard-coded fake behavior everywhere.

Possible functions:

mockCreateCompany()
mockGetDashboard()
mockUploadKnowledge()
mockPasteKnowledge()
mockConnectMCP()
mockGetConversations()
mockGetConversation()
mockSendMessage()
mockGetProspect()
mockStartCall()
mockCompleteCall()
mockGenerateArchitecture()

Build realistic latency.

Example chat flow:

User:
"We use Kubernetes on AWS. Could this work with us?"

Show:

Searching deployment documentation...

Then assistant:

"Yes. Given that you're already running Kubernetes on AWS, I wouldn't replace your orchestration layer. I'd place Grok FDE alongside your existing sales and technical stack..."

Update prospect memory:

AWS
Kubernetes

Next user message:

"Can I call you?"

Call starts.

During call, mock Atlas says something conceptually equivalent to:

"Since you mentioned you're using Kubernetes on AWS..."

This continuity is THE key demo.

==================================================
MOCK COMPANY
==================================================

Use a demo company representing Grok FDE itself.

Company:

Grok FDE

Agent:

Atlas

Knowledge sources:

- Product Overview
- Technical Architecture
- MCP Integration
- Voice & Communication
- Security
- Pricing placeholder

Mock prospect:

Globex

Known memory:

AWS
Kubernetes
Needs technical sales automation
Interested in MCP
Wants implementation details

==================================================
API CONTRACT
==================================================

PERSON B will implement APIs.

Do not invent inconsistent response formats.

Use the following contract.

CHAT:

POST /api/conversations/[id]/message

Request:

{
  "message": "Could this work with Kubernetes?"
}

Expected response:

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

Types:

file
paste
url
mcp

Statuses:

processing
ready
error

AGENT EVENT:

{
  "type": "using_tool",
  "label": "Using estimate_cost"
}

Supported event types:

searching_knowledge
searching_web
using_tool
generating_image
prospect_updated
needs_human

==================================================
ENVIRONMENT VARIABLES
==================================================

Add to .env.example:

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

XAI_API_KEY=
XAI_TEXT_MODEL=
XAI_VOICE_MODEL=
XAI_IMAGE_MODEL=
XAI_VIDEO_MODEL=

NEXT_PUBLIC_MOCK_AI=true

EMAIL_API_KEY=

Do not put secrets in committed files.

==================================================
BUILD ORDER
==================================================

Prioritize in this exact general order.

PHASE 1
Project setup
Design system
Layouts
Mock architecture

PHASE 2
Landing
Company onboarding
Knowledge page

PHASE 3
Dashboard
Conversations inbox
Prospect memory

PHASE 4
Prospect chat
Agent activity
Rich assistant responses

PHASE 5
Call UI
Mock call continuity
Transcript

PHASE 6
Generated architecture/artifact cards
Human escalation

PHASE 7
Real API wiring
Supabase data loading
Voice token integration

PHASE 8
Polish
Responsive states
Loading/error states
Demo fallback

==================================================
DEFINITION OF DONE
==================================================

You are done when, with NEXT_PUBLIC_MOCK_AI=true, someone can:

1. Open landing page.
2. Create a fictional company.
3. Name its FDE.
4. Upload fake docs.
5. Paste knowledge.
6. Connect a fake MCP server.
7. See knowledge become READY.
8. Open dashboard.
9. View conversations.
10. Open a prospect.
11. Chat with Atlas.
12. Watch agent activity.
13. See prospect memory update.
14. Click CALL.
15. Experience a convincing mock voice interaction.
16. See the call reference information previously given in chat.
17. End the call.
18. See transcript.
19. See updated prospect memory.
20. View/generated architecture artifact.
21. See a human escalation.
22. Refresh and retain a coherent demo experience.

Also:

npm run build

must succeed.

==================================================
IMPORTANT DECISION-MAKING RULE
==================================================

If the specification leaves a small UI detail unspecified, make the decision yourself.

Do not stop work to ask about:

- exact spacing
- exact copy
- icon choices
- component placement
- minor routing choices
- visual treatment
- mock data details

Use product judgment.

Optimize for:

A judge understanding the product in under 30 seconds.

A judge experiencing the chat → call memory magic moment.

The product feeling like a polished, coherent new category rather than a weekend chatbot.

==================================================
FINAL PR
==================================================

Create one PR containing your complete work.

Suggested title:

feat: complete Grok FDE product experience

Do not edit PERSON B's files.

Do not wait for PERSON B.

Build the entire product experience independently and make mock mode excellent.
