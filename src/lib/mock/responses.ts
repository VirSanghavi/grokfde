import type { AgentEvent, ArchitectureData, ProspectMemory } from "@/types/ui";

const STACK_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bkubernetes\b|\bk8s\b/i, label: "Kubernetes" },
  { re: /\baws\b|amazon web services/i, label: "AWS" },
  { re: /\bgcp\b|google cloud/i, label: "GCP" },
  { re: /\bazure\b/i, label: "Azure" },
  { re: /\beks\b/i, label: "EKS" },
  { re: /\bgithub actions\b/i, label: "GitHub Actions" },
  { re: /\bsalesforce\b/i, label: "Salesforce" },
  { re: /\bterraform\b/i, label: "Terraform" },
  { re: /\bdocker\b/i, label: "Docker" },
  { re: /\bpostgres(ql)?\b/i, label: "PostgreSQL" },
  { re: /\bnext\.?js\b/i, label: "Next.js" },
  { re: /\bsupabase\b/i, label: "Supabase" },
  { re: /\btypescript\b|\bts\b/i, label: "TypeScript" },
];

export function extractStackMentions(text: string): string[] {
  const found: string[] = [];
  for (const { re, label } of STACK_PATTERNS) {
    if (re.test(text) && !found.includes(label)) found.push(label);
  }
  return found;
}

export function mergeMemory(memory: ProspectMemory, text: string): ProspectMemory {
  const stack = extractStackMentions(text);
  const next = { ...memory, currentStack: [...memory.currentStack] };

  for (const item of stack) {
    if (!next.currentStack.includes(item)) next.currentStack.push(item);
  }

  if (/hipaa|baa|compliance/i.test(text)) {
    if (!next.requirements.includes("Compliance review needed")) {
      next.requirements = [...next.requirements, "Compliance review needed"];
    }
    if (!next.objections.includes("Compliance uncertainty")) {
      next.objections = [...next.objections, "Compliance uncertainty"];
    }
  }

  if (/sandbox/i.test(text)) {
    if (!next.requirements.includes("Sandbox creation for prospects")) {
      next.requirements = [...next.requirements, "Sandbox creation for prospects"];
    }
    next.nextAction = "Demonstrate MCP sandbox tooling";
  }

  if (/cost|pricing|budget/i.test(text)) {
    if (!next.painPoints.includes("Infrastructure cost")) {
      next.painPoints = [...next.painPoints, "Infrastructure cost"];
    }
  }

  if (/residen(cy|ce)|us data|data residency/i.test(text)) {
    if (!next.requirements.includes("US data residency")) {
      next.requirements = [...next.requirements, "US data residency"];
    }
  }

  if (stack.length) {
    next.summary = `Runs ${next.currentStack.join(", ")}. ${memory.summary.split(". ").slice(1).join(". ")}`.trim();
    next.stage = "technical-evaluation";
    if (!next.nextAction) next.nextAction = "Map architecture to current stack";
  }

  return next;
}

export function buildChatEvents(text: string): AgentEvent[] {
  const events: AgentEvent[] = [
    { type: "searching_knowledge", label: "Searching deployment documentation" },
  ];

  if (/security|hipaa|soc|compliance/i.test(text)) {
    events.push({ type: "searching_knowledge", label: "Reading security documentation" });
  }
  if (/cost|price|estimate/i.test(text)) {
    events.push({ type: "using_tool", label: "Using estimate_cost" });
  }
  if (/architecture|diagram|design/i.test(text)) {
    events.push({ type: "generating_architecture", label: "Generating architecture" });
  }
  if (/sandbox|mcp|tool/i.test(text)) {
    events.push({ type: "using_tool", label: "Using inspect_project" });
  }

  events.push({ type: "prospect_updated", label: "Updating prospect memory" });
  return events;
}

export function needsHumanEscalation(text: string): boolean {
  return /hipaa|baa|custom contract|legal|indemnif|sla guarantee|sign a/i.test(text);
}

export function buildAssistantReply(
  text: string,
  memory: ProspectMemory,
  agentName: string,
  companyName: string
): string {
  if (needsHumanEscalation(text)) {
    return `I want to verify that before giving you a definitive answer. I've flagged it for the ${companyName} team so a human can confirm the exact contractual language. In the meantime, I can walk through our documented security posture and data-handling model.`;
  }

  const stack = memory.currentStack;
  const hasK8s = stack.some((s) => /kubernetes|eks|k8s/i.test(s));
  const hasAws = stack.some((s) => /aws|eks/i.test(s));

  if (/recommend|given our|current stack|fit into our workflow|could .+ fit/i.test(text)) {
    if (hasK8s || hasAws) {
      return `Yes. Given that you're already running ${stack.join(" and ")}, I wouldn't replace your orchestration layer. I'd place ${companyName} alongside your existing sales and technical stack:\n\n1. **Knowledge layer** — your docs, APIs, pricing, and security materials train me once.\n2. **Prospect memory** — stack, constraints, and objections persist across chat, email, and voice.\n3. **Action layer** — MCP tools (sandboxes, cost estimates) plus architecture generation when you're ready.\n\nFor a Kubernetes-on-AWS shop, the cleanest path is: GitHub Actions → your cluster → ${companyName} as the always-on FDE in front of prospects. Want me to draft that architecture?`;
    }
    return `I can recommend a concrete deployment once I know a bit more about your environment. What orchestration and cloud are you on today?`;
  }

  if (/architecture|diagram|design/i.test(text)) {
    return `Drafting an architecture that maps ${companyName} onto ${stack.length ? stack.join(" + ") : "your environment"}. You'll see channels (chat/email/voice), the FDE runtime, company knowledge, and MCP tools as first-class components.`;
  }

  if (/integrat|implement|build it|connect.*(repo|codebase)|can you actually/i.test(text)) {
    const stackLabel = stack.length ? stack.join(" + ") : "your stack";
    return `Yes. I can integrate this without rewriting your existing authentication architecture.\n\nI'd add one server-side endpoint and one small client/wrapper, following the patterns already in your codebase (${stackLabel}).\n\nWhen you're ready, hit **Start Implementation**. I'll connect to your repository (or a demo repo), analyze the code, propose an exact plan, build on a branch, run checks, repair anything that fails, and prepare a PR for your review — nothing merges without you.`;
  }

  if (/next\.?js|supabase/i.test(text) && /work with|fit|integrat/i.test(text)) {
    return `Yes — Next.js and Supabase are a clean fit. I'd attach ${companyName} through your existing server route patterns and leave client auth alone.\n\nI can go further than a design: open **Start Implementation**, connect the repo, and I'll produce a reviewable PR.`;
  }

  if (/call|voice|talk/i.test(text) && text.length < 80) {
    return `Absolutely. Hit **Call ${agentName}** whenever you're ready. I'll already have your stack${stack.length ? ` (${stack.join(", ")})` : ""} in context, so we won't restart from zero.`;
  }

  if (/what do you do|who are you|how does .+ work/i.test(text)) {
    return `I'm ${agentName}, an AI Forward-Deployed Engineer for ${companyName}.\n\nCompanies train me once on their product docs, APIs, security materials, and optional MCP tools. Every prospect then gets a persistent technical engineer across **chat**, **email**, and **live voice**, with memory that follows them between channels.\n\nI'm not a FAQ bot. I discover requirements, map integrations, generate architectures, and escalate when something isn't in the docs.`;
  }

  if (extractStackMentions(text).length) {
    const mentions = extractStackMentions(text);
    return `Got it. I've noted you're on **${mentions.join(" + ")}**.\n\n${companyName} fits cleanly alongside that stack rather than replacing it. I can stay in your existing orchestration and cloud boundaries, keep prospect context across channels, and use MCP tools when you want sandboxes or cost estimates.\n\nWhat would you like to pressure-test first: deployment model, security posture, or a concrete implementation plan?`;
  }

  return `Based on ${companyName}'s product documentation, yes — this is exactly the workflow we designed for.\n\nYou upload knowledge once. I handle technical discovery across chat, email, and calls, keep a structured memory of each prospect's stack and constraints, and can generate implementation collateral when you're ready.\n\nTell me about your environment and I'll get specific.`;
}

export function defaultArchitecture(prospectName: string, companyName: string): ArchitectureData {
  return {
    title: `${prospectName} + ${companyName} Architecture`,
    nodes: [
      { id: "channels", label: "Prospect channels\n(chat · email · voice)", kind: "edge" },
      { id: "fde", label: companyName, kind: "core" },
      { id: "memory", label: "Prospect memory", kind: "data" },
      { id: "knowledge", label: "Company knowledge", kind: "data" },
      { id: "mcp", label: "MCP tools", kind: "tool" },
      { id: "company", label: "Human escalation", kind: "human" },
    ],
    edges: [
      { from: "channels", to: "fde" },
      { from: "fde", to: "memory" },
      { from: "fde", to: "knowledge" },
      { from: "fde", to: "mcp" },
      { from: "fde", to: "company", label: "needs human" },
    ],
    notes: [
      "Single FDE identity across all channels",
      "Knowledge trained once; every prospect inherits it",
      "MCP tools optional and permissioned",
    ],
  };
}

export function callScript(memory: ProspectMemory, agentName: string): Array<{
  speaker: "agent" | "prospect";
  text: string;
  activity?: AgentEvent;
  delayMs: number;
}> {
  const stack = memory.currentStack.length
    ? memory.currentStack.join(" and ")
    : "your current environment";

  return [
    {
      speaker: "agent",
      text: `Hi, this is ${agentName}. Since you mentioned you're using ${stack}, I thought we could go straight into how Grok FDE sits alongside that stack.`,
      activity: { type: "searching_knowledge", label: "Loading prospect context" },
      delayMs: 1600,
    },
    {
      speaker: "prospect",
      text: "Yes. We also use Salesforce and want technical prospects to create sandboxes themselves.",
      delayMs: 2200,
    },
    {
      speaker: "agent",
      text: "Perfect. Salesforce becomes another system of record, and sandbox creation is a natural MCP tool. I can expose create_sandbox as a read-gated action your team controls.",
      activity: { type: "using_tool", label: "Using inspect_project" },
      delayMs: 2400,
    },
    {
      speaker: "agent",
      text: "For residency: if you need US-only data paths, we keep knowledge collections and call transcripts in-region and never train foundation models on your prospect data.",
      activity: { type: "searching_knowledge", label: "Reading security documentation" },
      delayMs: 2600,
    },
    {
      speaker: "prospect",
      text: "We're evaluating roughly 500 GPU-hours a month on the customer side. Can you sketch an implementation plan?",
      delayMs: 2000,
    },
    {
      speaker: "agent",
      text: "Yes. I'll capture the 500 GPU-hours figure, Salesforce, and sandbox requirement into your memory, then we can generate an architecture right after this call.",
      activity: { type: "prospect_updated", label: "Updating prospect memory" },
      delayMs: 2200,
    },
  ];
}
