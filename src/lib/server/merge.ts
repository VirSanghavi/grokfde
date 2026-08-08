import {
  emptyKnowledgeSummary,
  emptyProspectMemory,
  KnowledgeSummarySchema,
  ProspectMemorySchema,
  type KnowledgeSummary,
  type ProspectMemory,
} from "./types";

function uniqStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function mergeStringArrays(existing: string[], incoming?: string[]): string[] {
  return uniqStrings([...(existing ?? []), ...(incoming ?? [])]);
}

export function parseKnowledgeSummary(raw: unknown): KnowledgeSummary {
  const parsed = KnowledgeSummarySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : emptyKnowledgeSummary();
}

export function mergeKnowledgeSummary(
  existingRaw: unknown,
  incomingRaw: unknown,
): KnowledgeSummary {
  const existing = parseKnowledgeSummary(existingRaw);
  const incoming = parseKnowledgeSummary(incomingRaw);

  return {
    products: mergeStringArrays(existing.products, incoming.products),
    capabilities: mergeStringArrays(existing.capabilities, incoming.capabilities),
    useCases: mergeStringArrays(existing.useCases, incoming.useCases),
    integrations: mergeStringArrays(existing.integrations, incoming.integrations),
    technicalFacts: mergeStringArrays(existing.technicalFacts, incoming.technicalFacts),
    pricingFacts: mergeStringArrays(existing.pricingFacts, incoming.pricingFacts),
    securityFacts: mergeStringArrays(existing.securityFacts, incoming.securityFacts),
    implementationFacts: mergeStringArrays(
      existing.implementationFacts,
      incoming.implementationFacts,
    ),
    commonObjections: mergeStringArrays(
      existing.commonObjections,
      incoming.commonObjections,
    ),
    buyerTypes: mergeStringArrays(existing.buyerTypes, incoming.buyerTypes),
    companyDescription:
      incoming.companyDescription?.trim() || existing.companyDescription,
    valueProposition: incoming.valueProposition?.trim() || existing.valueProposition,
  };
}

export function parseProspectMemory(raw: unknown): ProspectMemory {
  const parsed = ProspectMemorySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : emptyProspectMemory();
}

const STACK_CANON = [
  "Kubernetes",
  "EKS",
  "AWS",
  "GCP",
  "Azure",
  "Salesforce",
  "Lambda",
  "GitHub",
  "Postgres",
  "Snowflake",
  "MCP",
] as const;

function expandStackItem(item: string): string[] {
  const hits: string[] = [];
  for (const token of STACK_CANON) {
    if (new RegExp(`\\b${token}\\b`, "i").test(item)) hits.push(token);
  }
  return hits.length ? hits : item.trim() ? [item.trim()] : [];
}

function mergeStack(existing: string[], incoming?: string[]): string[] {
  const expanded = [...existing, ...(incoming ?? [])].flatMap(expandStackItem);
  return uniqStrings(expanded);
}

export function mergeProspectMemory(
  existingRaw: unknown,
  incomingRaw: unknown,
): ProspectMemory {
  const existing = parseProspectMemory(existingRaw);
  const incoming = parseProspectMemory(incomingRaw);

  // Prefer non-empty stage/summary/nextAction from incoming when present
  const stage =
    incoming.stage && incoming.stage !== "new" ? incoming.stage : existing.stage || "new";
  const summary = incoming.summary?.trim() || existing.summary;
  const nextAction = incoming.nextAction?.trim() || existing.nextAction;

  return {
    currentStack: mergeStack(existing.currentStack, incoming.currentStack),
    painPoints: mergeStringArrays(existing.painPoints, incoming.painPoints),
    requirements: mergeStringArrays(existing.requirements, incoming.requirements),
    technicalQuestions: mergeStringArrays(
      existing.technicalQuestions,
      incoming.technicalQuestions,
    ),
    objections: mergeStringArrays(existing.objections, incoming.objections),
    competitors: mergeStringArrays(existing.competitors, incoming.competitors),
    commitments: mergeStringArrays(existing.commitments, incoming.commitments),
    unresolvedQuestions: mergeStringArrays(
      existing.unresolvedQuestions,
      incoming.unresolvedQuestions,
    ),
    nextAction,
    stage,
    summary,
    industry: incoming.industry?.trim() || existing.industry,
    people: mergeStringArrays(existing.people, incoming.people),
  };
}

export function prospectToChatShape(memory: ProspectMemory) {
  return {
    stage: memory.stage || "new",
    summary: memory.summary || "",
    currentStack: memory.currentStack,
    painPoints: memory.painPoints,
    requirements: memory.requirements,
    objections: memory.objections,
    nextAction: memory.nextAction || "",
  };
}
