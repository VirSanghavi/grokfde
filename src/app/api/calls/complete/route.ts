import { z } from "zod";
import { askGrokStructured } from "@/lib/ai/grok";
import {
  CALL_SUMMARY_SYSTEM,
  callSummaryUserPrompt,
} from "@/lib/ai/prompts/call-summary";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import {
  getConversationBundle,
  getProspectMemory,
  insertMessage,
  prospectToChatShape,
  updateProspectMemory,
} from "@/lib/server/prospect-context";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { CallSummarySchema } from "@/lib/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({
  conversationId: z.string().uuid(),
  transcript: z.string().min(1),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const { conversation, prospect } = await getConversationBundle(body.conversationId);
    const existing = getProspectMemory(prospect);

    let summary = await askGrokStructured({
      schema: CallSummarySchema,
      schemaName: "CallSummary",
      messages: [
        { role: "system", content: CALL_SUMMARY_SYSTEM },
        { role: "user", content: callSummaryUserPrompt(body.transcript) },
      ],
    }).catch(() => ({
      summary: body.transcript.slice(0, 500),
      technicalRequirements: [] as string[],
      objections: [] as string[],
      commitments: [] as string[],
      unansweredQuestions: [] as string[],
      nextSteps: [] as string[],
      dealStage: existing.stage || "technical-evaluation",
      stackMentions: [] as string[],
    }));

    // Pull stack mentions from transcript heuristically
    const stackHits = body.transcript.match(
      /\b(Kubernetes|AWS|GCP|Azure|Salesforce|EKS|Lambda|GitHub|Postgres|Snowflake|MCP)\b/gi,
    );
    if (stackHits?.length) {
      summary = {
        ...summary,
        stackMentions: Array.from(
          new Set([...(summary.stackMentions ?? []), ...stackHits]),
        ),
      };
    }

    const db = getSupabaseAdmin();
    const { data: call, error } = await db
      .from("calls")
      .insert({
        conversation_id: conversation.id,
        started_at: body.startedAt ?? null,
        ended_at: body.endedAt ?? new Date().toISOString(),
        transcript: body.transcript,
        summary_json: summary,
      })
      .select("*")
      .single();

    if (error || !call) {
      throw new ApiError("INTERNAL_ERROR", "Could not save call", {
        status: 500,
        details: error?.message,
      });
    }

    await insertMessage({
      conversationId: conversation.id,
      channel: "call",
      role: "system",
      content: `Call completed. ${summary.summary}`,
      metadata: { callId: call.id, summary },
    });

    // Also store transcript excerpts as call-channel messages for timeline
    await insertMessage({
      conversationId: conversation.id,
      channel: "call",
      role: "assistant",
      content: body.transcript.slice(0, 8000),
      metadata: { callId: call.id, kind: "transcript" },
    });

    const updated = await updateProspectMemory(prospect.id, {
      summary: summary.summary || existing.summary,
      stage: summary.dealStage || existing.stage,
      requirements: summary.technicalRequirements,
      objections: summary.objections,
      commitments: summary.commitments,
      unresolvedQuestions: summary.unansweredQuestions,
      currentStack: summary.stackMentions,
      nextAction: summary.nextSteps?.[0] || existing.nextAction,
    });

    const memory = getProspectMemory(updated);

    return jsonOk({
      call: {
        id: call.id,
        conversationId: conversation.id,
        startedAt: call.started_at,
        endedAt: call.ended_at,
        summary,
      },
      prospect: {
        id: updated.id,
        ...prospectToChatShape(memory),
        memory,
      },
      events: [
        { type: "prospect_updated", label: "Call memory merged into prospect" },
      ],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid call completion payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
