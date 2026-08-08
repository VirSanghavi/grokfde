import { z } from "zod";
import { askGrokStructured } from "@/lib/ai/grok";
import { SLACK_FDE_SYSTEM, slackFdeUserPrompt } from "@/lib/ai/prompts/slack-fde";
import {
  addTimelineEvent,
  advanceMilestoneOnEvent,
  buildAccountSnapshot,
  buildDeterministicStatus,
  createOrGetAccount,
  formatStatusNatural,
  getAccount,
  updateAccount,
  type AccountRow,
} from "./accounts";
import {
  completeCommitmentsMatching,
  createBlocker,
  createCommitment,
  createDecision,
  resolveBlocker,
} from "./blockers";
import { getCompanyById } from "./company-context";
import { upsertDeployment } from "./deployments";
import { ApiError } from "./errors";
import { recordFieldSignal } from "./field-signals";
import { createImplementationPlan } from "./implementation";
import { parseKnowledgeSummary, parseProspectMemory } from "./merge";
import { getProspectMemory } from "./prospect-context";
import { insertMessage } from "./prospect-context";
import { getSupabaseAdmin } from "./supabase-admin";
import { replyInThread, postMessage } from "./slack";
import type { ProspectRow } from "./types";

const SlackActionSchema = z.object({
  intent: z.string().default("general"),
  reply: z.string().default(""),
  shouldReply: z.boolean().default(true),
  createIssue: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    })
    .nullable()
    .optional(),
  createBlocker: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      ownerType: z.enum(["customer", "vendor", "fde", "unknown"]).default("unknown"),
      impact: z.string().optional(),
    })
    .nullable()
    .optional(),
  resolveBlockerTitle: z.string().nullable().optional(),
  createDecision: z
    .object({
      title: z.string(),
      decision: z.string(),
      rationale: z.string().optional(),
    })
    .nullable()
    .optional(),
  createCommitment: z
    .object({
      owner: z.string(),
      description: z.string(),
    })
    .nullable()
    .optional(),
  requirements: z.array(z.string()).default([]),
  technicalFacts: z.array(z.string()).default([]),
  stageSuggestion: z.string().nullable().optional(),
  implementationRequest: z
    .object({
      objective: z.string(),
      needsApproval: z.boolean().default(true),
    })
    .nullable()
    .optional(),
  fieldSignal: z
    .object({
      type: z.string(),
      title: z.string(),
      summary: z.string().optional(),
    })
    .nullable()
    .optional(),
  needsHuman: z.boolean().default(false),
});

function stripMention(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/gi, "")
    .replace(/@Atlas\b/gi, "")
    .replace(/@atlas\b/gi, "")
    .trim();
}

function isAddressedToFde(text: string, botUserId?: string | null): boolean {
  if (/@atlas\b/i.test(text)) return true;
  if (botUserId && text.includes(`<@${botUserId}>`)) return true;
  if (/^atlas[,:\s]/i.test(text.trim())) return true;
  return false;
}

function isStatusQuestion(text: string): boolean {
  return /\bstatus\b\??$/i.test(text.trim()) || /\bwhat'?s the status\b/i.test(text);
}

function heuristicActions(message: string, statusText: string) {
  const lower = message.toLowerCase();
  const out: z.infer<typeof SlackActionSchema> = {
    intent: "general",
    reply: "",
    shouldReply: true,
    requirements: [],
    technicalFacts: [],
    needsHuman: false,
  };

  if (isStatusQuestion(message)) {
    out.intent = "status";
    out.reply = statusText;
    return out;
  }

  if (/\b401\b|unauthorized|auth(entication)? (fail|error|change)/i.test(message)) {
    out.intent = "issue";
    out.createIssue = {
      title: "Staging authentication failure (401)",
      description: message,
      severity: "high",
    };
    out.reply =
      "I'm checking the staging auth path now — looking at the latest integration auth headers and deployment config.";
    out.createCommitment = {
      owner: "fde",
      description: "Investigate staging 401 and prepare auth fix plan",
    };
    return out;
  }

  if (/\bsecurity (approval|review)|hasn't approved|waiting on security/i.test(message)) {
    out.intent = "blocker";
    out.createBlocker = {
      title: "Security approval",
      description: message,
      ownerType: "customer",
      impact: "production launch",
    };
    out.reply =
      "Got it — I've logged *Security approval* as a customer-owned blocker on production launch. I'll keep implementation ready and wait on that gate.";
    return out;
  }

  if (/\bdeploy once\b|\bafter security\b|once security approves/i.test(message)) {
    out.intent = "blocker";
    out.createBlocker = {
      title: "Security approval",
      description: message,
      ownerType: "customer",
      impact: "production launch",
    };
    out.createCommitment = {
      owner: "customer",
      description: "Deploy after security approval",
    };
    out.reply =
      "Understood. I'll hold production rollout until security approval lands. Staging/PR work can stay ready.";
    return out;
  }

  if (/\bjwt\b/i.test(message) && /\b(skip|keep|use|choose|chose|decided)\b/i.test(message)) {
    out.intent = "decision";
    out.createDecision = {
      title: "Authentication approach",
      decision: "Keep existing JWT auth; skip OAuth for this integration",
      rationale: message,
    };
    out.reply =
      "Logged the decision: *keep JWT auth and skip OAuth* for this integration. I'll align the implementation with that.";
    return out;
  }

  if (/\bx-internal-token\b|internal.token header|support our .*header/i.test(message)) {
    out.intent = "implementation_request";
    out.implementationRequest = {
      objective: "Support X-Internal-Token header in the Grok FDE integration auth path",
      needsApproval: true,
    };
    out.reply =
      "I can update the integration to accept `X-Internal-Token`. I've prepared an implementation plan for review — I won't open a branch until you approve.";
    out.fieldSignal = {
      type: "integration_request",
      title: "Custom internal auth header support",
      summary: "Customer needs X-Internal-Token header support",
    };
    return out;
  }

  if (/\beu-only|data residency|eu storage/i.test(message)) {
    out.intent = "requirement";
    out.requirements = ["EU-only storage before launch"];
    out.createBlocker = {
      title: "EU-only storage requirement",
      description: message,
      ownerType: "vendor",
      impact: "launch",
    };
    out.reply =
      "Captured *EU-only storage before launch* as a requirement. If our docs don't already cover contractual residency guarantees, I'll flag anything that needs a human.";
    out.fieldSignal = {
      type: "security_requirement",
      title: "EU-only data residency",
      summary: message,
    };
    return out;
  }

  if (/\bbaa\b|\bhipaa\b/i.test(message)) {
    out.intent = "knowledge";
    out.needsHuman = true;
    out.createBlocker = {
      title: "HIPAA/BAA contractual confirmation",
      description: message,
      ownerType: "vendor",
      impact: "enterprise close / launch",
    };
    out.reply =
      "I won't invent a contractual HIPAA/BAA commitment. I've flagged this for a human on our side and logged it as a vendor-owned blocker.";
    return out;
  }

  if (/\bwhy did we (choose|decide)|what did we decide/i.test(message)) {
    out.intent = "decision";
    out.reply =
      "I'll pull from logged account decisions. If nothing is recorded yet, say what you remember and I'll lock it in.";
    return out;
  }

  out.reply = `On it — I have the account context loaded. ${statusText.split("\n")[0] || ""}`.trim();
  return out;
}

async function loadAccountContextBlob(account: AccountRow): Promise<string> {
  const db = getSupabaseAdmin();
  const company = await getCompanyById(account.company_id);
  const { data: prospect } = await db
    .from("prospects")
    .select("*")
    .eq("id", account.prospect_id)
    .single();
  const memory = prospect
    ? getProspectMemory(prospect as ProspectRow)
    : parseProspectMemory({});
  const snap = await buildAccountSnapshot(account.id);
  const knowledge = parseKnowledgeSummary(company.knowledge_summary_json);

  return JSON.stringify(
    {
      company: company.name,
      agent: company.agent_name,
      knowledge: {
        products: knowledge.products,
        capabilities: knowledge.capabilities,
        securityFacts: knowledge.securityFacts,
        valueProposition: knowledge.valueProposition,
      },
      memory,
      decisions: snap.decisions,
      blockers: snap.blockers,
      commitments: snap.commitments,
      deployment: snap.deployment,
      implementation: snap.implementation,
      issues: snap.issues,
      technicalEnvironment: snap.technicalEnvironment,
      successOutcome: snap.successOutcome,
    },
    null,
    2,
  );
}

export async function connectSlackChannel(args: {
  accountId: string;
  teamId?: string;
  workspaceName?: string;
  channelId: string;
  channelName?: string;
  botUserId?: string;
  accessToken?: string;
}) {
  const account = await getAccount(args.accountId);
  const db = getSupabaseAdmin();
  const teamId = args.teamId || "T_DEMO";
  const channelId = args.channelId;

  const { data: existing } = await db
    .from("slack_connections")
    .select("*")
    .eq("team_id", teamId)
    .eq("channel_id", channelId)
    .maybeSingle();

  let row;
  if (existing) {
    const { data } = await db
      .from("slack_connections")
      .update({
        account_id: account.id,
        workspace_name: args.workspaceName ?? existing.workspace_name,
        channel_name: args.channelName ?? existing.channel_name,
        bot_user_id: args.botUserId ?? existing.bot_user_id,
        access_token: args.accessToken ?? existing.access_token,
        status: "connected",
      })
      .eq("id", existing.id)
      .select("id, account_id, team_id, workspace_name, channel_id, channel_name, status, bot_user_id, created_at")
      .single();
    row = data;
  } else {
    const { data, error } = await db
      .from("slack_connections")
      .insert({
        account_id: account.id,
        team_id: teamId,
        workspace_name: args.workspaceName || "Customer Workspace",
        channel_id: channelId,
        channel_name: args.channelName || channelId,
        bot_user_id: args.botUserId || "U_ATLAS_DEMO",
        access_token: args.accessToken || process.env.SLACK_BOT_TOKEN || null,
        status: "connected",
        metadata_json: { demo: !args.accessToken && !process.env.SLACK_BOT_TOKEN },
      })
      .select("id, account_id, team_id, workspace_name, channel_id, channel_name, status, bot_user_id, created_at")
      .single();
    if (error || !data) {
      throw new ApiError("INTERNAL_ERROR", "Could not connect Slack channel", {
        status: 500,
        details: error?.message,
      });
    }
    row = data;
  }

  await advanceMilestoneOnEvent(account.id, "repo_connected");
  await addTimelineEvent(
    account.id,
    "slack",
    `Slack channel connected: #${row?.channel_name || channelId}`,
    { channelId, teamId },
  );
  await updateAccount(account.id, {
    stage: account.stage === "prospect" ? "discovery" : account.stage,
  });

  return {
    id: row!.id,
    accountId: row!.account_id,
    teamId: row!.team_id,
    workspaceName: row!.workspace_name,
    channelId: row!.channel_id,
    channelName: row!.channel_name,
    status: row!.status,
    // never return access_token
  };
}

export async function resolveAccountBySlackChannel(
  teamId: string,
  channelId: string,
) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("slack_connections")
    .select("*")
    .eq("team_id", teamId)
    .eq("channel_id", channelId)
    .eq("status", "connected")
    .maybeSingle();
  if (!data) return null;
  const account = await getAccount(data.account_id);
  return { connection: data, account };
}

async function ensureConversation(account: AccountRow): Promise<string> {
  if (account.conversation_id) return account.conversation_id;
  const db = getSupabaseAdmin();
  const { data: conv } = await db
    .from("conversations")
    .insert({
      company_id: account.company_id,
      prospect_id: account.prospect_id,
    })
    .select("id")
    .single();
  if (!conv) throw new ApiError("INTERNAL_ERROR", "Could not create conversation", { status: 500 });
  await updateAccount(account.id, { conversation_id: conv.id });
  return conv.id as string;
}

export type ProcessSlackMessageResult = {
  accountId: string;
  replied: boolean;
  reply?: string;
  threadTs?: string;
  replyTs?: string;
  intent?: string;
  issueId?: string;
  planId?: string;
  blockerIds?: string[];
};

export async function processSlackMessage(args: {
  teamId?: string;
  channelId: string;
  channelName?: string;
  userName?: string;
  userId?: string;
  text: string;
  ts?: string;
  threadTs?: string;
  botUserId?: string;
  accountId?: string;
}): Promise<ProcessSlackMessageResult> {
  const db = getSupabaseAdmin();
  const teamId = args.teamId || "T_DEMO";
  let account: AccountRow;
  let connection: Record<string, unknown> | null = null;

  if (args.accountId) {
    account = await getAccount(args.accountId);
    const { data } = await db
      .from("slack_connections")
      .select("*")
      .eq("account_id", account.id)
      .eq("status", "connected")
      .maybeSingle();
    connection = data;
  } else {
    const resolved = await resolveAccountBySlackChannel(teamId, args.channelId);
    if (!resolved) {
      throw new ApiError(
        "NOT_FOUND",
        "No account mapped to this Slack channel. Connect channel first.",
        { status: 404 },
      );
    }
    account = resolved.account;
    connection = resolved.connection;
  }

  // Ignore pure bot echoes without mention
  const text = args.text || "";
  const botUserId =
    args.botUserId || (connection?.bot_user_id as string | undefined) || "U_ATLAS_DEMO";
  if (!isAddressedToFde(text, botUserId) && !args.accountId) {
    // demo endpoint may force process via accountId; real events require mention
    return { accountId: account.id, replied: false };
  }

  const cleaned = stripMention(text);
  const conversationId = await ensureConversation(account);
  const threadTs = args.threadTs || args.ts || `${Date.now() / 1000}`;

  await insertMessage({
    conversationId,
    channel: "slack",
    role: "user",
    content: text,
    metadata: {
      slack: {
        teamId,
        channelId: args.channelId,
        channelName: args.channelName || connection?.channel_name,
        userName: args.userName,
        userId: args.userId,
        ts: args.ts,
        threadTs,
      },
    },
  });

  await addTimelineEvent(account.id, "slack", `Slack: ${cleaned.slice(0, 160)}`, {
    channelId: args.channelId,
    threadTs,
    userName: args.userName,
  });

  const status = await buildDeterministicStatus(account.id);
  const statusText = formatStatusNatural(status);
  const company = await getCompanyById(account.company_id);
  const contextBlob = await loadAccountContextBlob(account);

  let actions = heuristicActions(cleaned, statusText);

  // Decision lookup special-case
  if (/\bwhy did we|what did we decide|decision about/i.test(cleaned)) {
    const snap = await buildAccountSnapshot(account.id);
    const decisions = snap.decisions as Array<{ title: string; decision: string; rationale?: string }>;
    if (decisions.length) {
      const jwt = decisions.find((d) => /jwt|auth/i.test(d.title + d.decision));
      const d = jwt || decisions[0];
      actions.intent = "decision";
      actions.reply = `We decided: *${d.decision}*${d.rationale ? ` (${d.rationale})` : ""}. Source: account decision log.`;
    }
  }

  try {
    if (process.env.XAI_API_KEY && !isStatusQuestion(cleaned)) {
      const structured = await askGrokStructured({
        schema: SlackActionSchema,
        schemaName: "SlackFdeAction",
        temperature: 0.3,
        messages: [
          { role: "system", content: SLACK_FDE_SYSTEM },
          {
            role: "user",
            content: slackFdeUserPrompt({
              agentName: company.agent_name,
              companyName: company.name,
              accountStatus: statusText,
              accountContext: contextBlob,
              message: cleaned,
              userName: args.userName || "customer",
            }),
          },
        ],
      });
      // Prefer model reply but keep heuristic issue/blocker detection if model omitted
      actions = {
        ...actions,
        intent: structured.intent || actions.intent,
        reply: structured.reply || actions.reply,
        shouldReply: structured.shouldReply ?? actions.shouldReply,
        createIssue: structured.createIssue
          ? {
              title: structured.createIssue.title,
              description: structured.createIssue.description,
              severity: structured.createIssue.severity || "medium",
            }
          : actions.createIssue,
        createBlocker: structured.createBlocker
          ? {
              title: structured.createBlocker.title,
              description: structured.createBlocker.description,
              ownerType: structured.createBlocker.ownerType || "unknown",
              impact: structured.createBlocker.impact,
            }
          : actions.createBlocker,
        resolveBlockerTitle:
          structured.resolveBlockerTitle ?? actions.resolveBlockerTitle,
        createDecision: structured.createDecision || actions.createDecision,
        createCommitment: structured.createCommitment || actions.createCommitment,
        requirements: structured.requirements?.length
          ? structured.requirements
          : actions.requirements,
        technicalFacts: structured.technicalFacts?.length
          ? structured.technicalFacts
          : actions.technicalFacts,
        stageSuggestion: structured.stageSuggestion ?? actions.stageSuggestion,
        implementationRequest: structured.implementationRequest
          ? {
              objective: structured.implementationRequest.objective,
              needsApproval:
                structured.implementationRequest.needsApproval ?? true,
            }
          : actions.implementationRequest,
        fieldSignal: structured.fieldSignal || actions.fieldSignal,
        needsHuman: structured.needsHuman ?? actions.needsHuman,
      };
    }
  } catch (err) {
    console.warn("[slack-fde] structured action failed", err);
  }

  if (isStatusQuestion(cleaned)) {
    actions.intent = "status";
    actions.reply = statusText;
  }

  const blockerIds: string[] = [];
  let issueId: string | undefined;
  let planId: string | undefined;

  // Apply state mutations
  if (actions.createIssue) {
    const { data: issue } = await db
      .from("production_issues")
      .insert({
        account_id: account.id,
        title: actions.createIssue.title,
        description: actions.createIssue.description || cleaned,
        source: "slack",
        severity: actions.createIssue.severity || "medium",
        status: "investigating",
        slack_thread_ts: threadTs,
        metadata_json: { channelId: args.channelId },
      })
      .select("*")
      .single();
    issueId = issue?.id;
    await addTimelineEvent(account.id, "issue", `Issue: ${actions.createIssue.title}`, {
      issueId,
    });
    await upsertDeployment({
      accountId: account.id,
      environment: "staging",
      status: "degraded",
      metadata: { reason: actions.createIssue.title },
    });
  }

  if (actions.createBlocker) {
    const b = await createBlocker({
      accountId: account.id,
      title: actions.createBlocker.title,
      description: actions.createBlocker.description,
      ownerType: actions.createBlocker.ownerType,
      impact: actions.createBlocker.impact,
      source: "slack",
    });
    blockerIds.push(b.id);
    await updateAccount(account.id, { stage: "blocked" });
  }

  if (actions.resolveBlockerTitle) {
    await resolveBlocker({
      accountId: account.id,
      title: actions.resolveBlockerTitle,
    });
  }

  if (actions.createDecision) {
    await createDecision({
      accountId: account.id,
      title: actions.createDecision.title,
      decision: actions.createDecision.decision,
      rationale: actions.createDecision.rationale,
      source: "slack",
      sourceReference: threadTs,
    });
  }

  if (actions.createCommitment) {
    await createCommitment({
      accountId: account.id,
      owner: actions.createCommitment.owner,
      description: actions.createCommitment.description,
      source: "slack",
    });
  }

  if (actions.requirements?.length || actions.technicalFacts?.length) {
    const env = {
      ...(account.technical_environment_json || {}),
      requirements: Array.from(
        new Set([
          ...((account.technical_environment_json as { requirements?: string[] })
            ?.requirements || []),
          ...(actions.requirements || []),
        ]),
      ),
      facts: Array.from(
        new Set([
          ...((account.technical_environment_json as { facts?: string[] })?.facts || []),
          ...(actions.technicalFacts || []),
        ]),
      ),
    };
    await updateAccount(account.id, { technical_environment_json: env });
  }

  if (actions.stageSuggestion && typeof actions.stageSuggestion === "string") {
    await updateAccount(account.id, { stage: actions.stageSuggestion });
  }

  if (actions.implementationRequest && account.workspace_id) {
    try {
      const plan = await createImplementationPlan({
        workspaceId: account.workspace_id,
        objective: actions.implementationRequest.objective,
      });
      planId = plan.planId;
      await createCommitment({
        accountId: account.id,
        owner: "fde",
        description: `Prepare plan: ${actions.implementationRequest.objective}`,
        source: "slack",
      });
      if (!/plan for review/i.test(actions.reply)) {
        actions.reply = `${actions.reply}\n\nPlan \`${plan.planId.slice(0, 8)}\` is ready for approval before any branch work.`;
      }
    } catch (err) {
      console.warn("[slack-fde] plan creation failed", err);
    }
  }

  if (actions.fieldSignal) {
    await recordFieldSignal({
      companyId: account.company_id,
      accountId: account.id,
      type: actions.fieldSignal.type,
      title: actions.fieldSignal.title,
      summary: actions.fieldSignal.summary,
    });
  }

  if (actions.needsHuman) {
    await db.from("escalations").insert({
      company_id: account.company_id,
      prospect_id: account.prospect_id,
      conversation_id: conversationId,
      question: cleaned,
      reason: "Slack question requires human confirmation",
      priority: "high",
      status: "open",
      suggested_response: actions.reply?.slice(0, 1000),
    });
  }

  // Auto-link issue to plan if both exist and issue is auth-related
  if (issueId && account.workspace_id && /401|auth/i.test(cleaned)) {
    try {
      const plan = await createImplementationPlan({
        workspaceId: account.workspace_id,
        objective:
          "Fix staging 401 auth failure — align integration with current auth header/JWT middleware",
      });
      planId = plan.planId;
      await db
        .from("production_issues")
        .update({
          plan_id: plan.planId,
          status: "investigating",
          root_cause:
            "Likely auth header mismatch after recent auth change (staging still using old header).",
        })
        .eq("id", issueId);
      actions.reply = `${actions.reply}\n\nLikely cause: staging still sending an old auth header after the JWT middleware change. I've drafted fix plan \`${plan.planId.slice(0, 8)}\` for approval.`;
      await createCommitment({
        accountId: account.id,
        owner: "fde",
        description: "Prepare auth patch for staging 401",
        source: "slack",
      });
    } catch (err) {
      console.warn("[slack-fde] auto plan for issue failed", err);
    }
  }

  let replyTs: string | undefined;
  let replied = false;
  if (actions.shouldReply !== false && actions.reply) {
    const token = (connection?.access_token as string | undefined) || process.env.SLACK_BOT_TOKEN;
    const posted = await replyInThread({
      channel: args.channelId,
      threadTs,
      text: actions.reply,
      token,
    });
    replyTs = posted.ts;
    replied = true;

    await insertMessage({
      conversationId,
      channel: "slack",
      role: "assistant",
      content: actions.reply,
      metadata: {
        slack: {
          channelId: args.channelId,
          threadTs,
          ts: replyTs,
          provider: posted.provider,
        },
        intent: actions.intent,
      },
    });
    await addTimelineEvent(account.id, "slack", `Atlas: ${actions.reply.slice(0, 160)}`, {
      threadTs,
      replyTs,
    });
  }

  return {
    accountId: account.id,
    replied,
    reply: actions.reply,
    threadTs,
    replyTs,
    intent: actions.intent,
    issueId,
    planId,
    blockerIds,
  };
}

/** Notify Slack when implementation becomes ready (event-driven follow-through). */
export async function notifySlackImplementationReady(args: {
  accountId: string;
  runId: string;
  branchName?: string;
  prUrl?: string;
}) {
  const db = getSupabaseAdmin();
  const { data: conn } = await db
    .from("slack_connections")
    .select("*")
    .eq("account_id", args.accountId)
    .eq("status", "connected")
    .maybeSingle();
  if (!conn) return null;

  await completeCommitmentsMatching(args.accountId, /patch|auth fix|prepare/i);
  await advanceMilestoneOnEvent(args.accountId, "implementation_ready");

  const text = args.prUrl
    ? `The patch I mentioned is ready for review: ${args.prUrl}`
    : `Implementation run is *ready_for_review* on \`${args.branchName || "branch"}\` (run \`${args.runId.slice(0, 8)}\`). Human review required before merge.`;

  const posted = await postMessage({
    channel: conn.channel_id,
    text,
    token: conn.access_token,
  });
  await addTimelineEvent(args.accountId, "slack", text, { proactive: true });
  return posted;
}

export async function notifySlackDeployment(args: {
  accountId: string;
  status: string;
  environment?: string;
}) {
  const db = getSupabaseAdmin();
  const { data: conn } = await db
    .from("slack_connections")
    .select("*")
    .eq("account_id", args.accountId)
    .eq("status", "connected")
    .maybeSingle();
  if (!conn) return null;

  const env = args.environment || "production";
  const text =
    args.status === "production"
      ? "Production rollout completed successfully."
      : `Deployment update: *${env}* is now *${args.status}*.`;

  const posted = await postMessage({
    channel: conn.channel_id,
    text,
    token: conn.access_token,
  });
  await addTimelineEvent(args.accountId, "deployment", text, { proactive: true });
  return posted;
}

// Re-export helpers used by routes/tests
export { createOrGetAccount };
