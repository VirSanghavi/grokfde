import { ApiError } from "./errors";
import { parseProspectMemory } from "./merge";
import { getSupabaseAdmin } from "./supabase-admin";
import type { ProspectRow } from "./types";

export type WorkspaceEvent = {
  type: string;
  label: string;
  at?: string;
};

export type WorkspaceRow = {
  id: string;
  company_id: string;
  prospect_id: string;
  conversation_id: string | null;
  status: string;
  customer_summary_json: Record<string, unknown>;
  architecture_json: Record<string, unknown>;
  analysis_json: Record<string, unknown>;
  events_json: WorkspaceEvent[];
  created_at: string;
  updated_at: string;
};

export function pushEvent(
  events: WorkspaceEvent[] | unknown,
  type: string,
  label: string,
): WorkspaceEvent[] {
  const list = Array.isArray(events) ? [...(events as WorkspaceEvent[])] : [];
  list.push({ type, label, at: new Date().toISOString() });
  return list.slice(-80);
}

export async function createWorkspace(args: {
  prospectId: string;
  conversationId?: string;
}): Promise<WorkspaceRow> {
  const db = getSupabaseAdmin();
  const { data: prospect, error: pErr } = await db
    .from("prospects")
    .select("*")
    .eq("id", args.prospectId)
    .maybeSingle();

  if (pErr || !prospect) {
    throw new ApiError("NOT_FOUND", "Prospect not found", { status: 404 });
  }

  const p = prospect as ProspectRow;
  const memory = parseProspectMemory(p.memory_json);

  const customerSummary = {
    prospectCompany: p.company_name,
    personName: p.person_name,
    stage: p.stage,
    memory,
  };

  const architecture = {
    stack: memory.currentStack,
    services: [],
    datastores: memory.currentStack.filter((s) =>
      /supabase|postgres|snowflake/i.test(s),
    ),
    auth: [],
    deployment: memory.currentStack.filter((s) => /aws|gcp|azure|kubernetes|eks/i.test(s)),
    integrations: [],
    constraints: memory.objections,
  };

  const { data, error } = await db
    .from("customer_workspaces")
    .insert({
      company_id: p.company_id,
      prospect_id: p.id,
      conversation_id: args.conversationId ?? null,
      status: "discovery",
      customer_summary_json: customerSummary,
      architecture_json: architecture,
      events_json: [
        {
          type: "workspace_created",
          label: "Customer workspace created from prospect memory",
          at: new Date().toISOString(),
        },
      ],
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not create workspace", {
      status: 500,
      details: error?.message,
    });
  }

  return data as WorkspaceRow;
}

export async function getWorkspace(id: string): Promise<WorkspaceRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("customer_workspaces")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    throw new ApiError("NOT_FOUND", "Workspace not found", { status: 404 });
  }
  return data as WorkspaceRow;
}

export async function updateWorkspace(
  id: string,
  patch: Partial<{
    status: string;
    customer_summary_json: Record<string, unknown>;
    architecture_json: Record<string, unknown>;
    analysis_json: Record<string, unknown>;
    events_json: WorkspaceEvent[];
  }>,
): Promise<WorkspaceRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("customer_workspaces")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new ApiError("INTERNAL_ERROR", "Could not update workspace", {
      status: 500,
      details: error?.message,
    });
  }
  return data as WorkspaceRow;
}

export function workspacePublic(ws: WorkspaceRow) {
  return {
    id: ws.id,
    companyId: ws.company_id,
    prospectId: ws.prospect_id,
    conversationId: ws.conversation_id,
    status: ws.status,
    customerSummary: ws.customer_summary_json,
    architecture: ws.architecture_json,
    analysis: ws.analysis_json,
    events: ws.events_json ?? [],
    createdAt: ws.created_at,
    updatedAt: ws.updated_at,
  };
}
