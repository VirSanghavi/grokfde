import { getSupabaseAdmin } from "./supabase-admin";
import { addTimelineEvent, advanceMilestoneOnEvent, updateAccount } from "./accounts";
import { ApiError } from "./errors";

export async function getDeployment(accountId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("deployment_states")
    .select("*")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function upsertDeployment(args: {
  accountId: string;
  environment?: string;
  status: string;
  version?: string;
  checks?: unknown[];
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  postSlack?: boolean;
}) {
  const db = getSupabaseAdmin();
  const existing = await getDeployment(args.accountId);
  const payload = {
    account_id: args.accountId,
    environment: args.environment || existing?.environment || "staging",
    status: args.status,
    version: args.version ?? existing?.version ?? null,
    checks_json: args.checks ?? existing?.checks_json ?? [],
    metrics_json: args.metrics ?? existing?.metrics_json ?? {},
    metadata_json: {
      ...(existing?.metadata_json as object || {}),
      ...(args.metadata || {}),
      simulated: true,
    },
    updated_at: new Date().toISOString(),
  };

  let data;
  if (existing) {
    const res = await db
      .from("deployment_states")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    data = res.data;
  } else {
    const res = await db.from("deployment_states").insert(payload).select("*").single();
    data = res.data;
  }
  if (!data) throw new ApiError("INTERNAL_ERROR", "Could not update deployment", { status: 500 });

  await addTimelineEvent(
    args.accountId,
    "deployment",
    `Deployment ${payload.environment} → ${payload.status}`,
    { deploymentId: data.id, status: payload.status },
  );

  if (args.status === "staging" || args.status === "validating") {
    await advanceMilestoneOnEvent(args.accountId, "staging");
    await updateAccount(args.accountId, { stage: "staging" });
  }
  if (args.status === "production") {
    await advanceMilestoneOnEvent(args.accountId, "production");
    await updateAccount(args.accountId, { stage: "production" });
  }
  if (args.status === "ready_for_production") {
    await updateAccount(args.accountId, { stage: "staging" });
  }

  return data;
}
