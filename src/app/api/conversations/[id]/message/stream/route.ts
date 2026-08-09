import { z } from "zod";
import { after } from "next/server";
import { streamChatMessage, type ChatStreamEvent } from "@/lib/server/chat-agent";
import { ApiError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Schema = z.object({
  message: z.string().min(1),
  channel: z.enum(["chat", "email"]).optional(),
  confirmedWriteTools: z.array(z.string()).optional(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * If the client disconnects we keep generating for this long so the turn can
 * finish and persist COMPLETE text — a prospect who closes the tab mid-answer
 * must still leave a whole message behind, or the next session reads a
 * truncated history. This is set above a realistic worst-case turn (a two-model
 * tool turn measures ~30s) so the cutoff is a backstop against a hung upstream,
 * not the normal path. Past it the xAI request is aborted and whatever was
 * generated is persisted, flagged partial. The upstream socket is released
 * unconditionally when the turn settles, so nothing leaks either way.
 */
const DISCONNECT_GRACE_MS = 60_000;

/** Nginx/Vercel will happily buffer an event stream unless told not to. */
const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

function errorEvent(err: unknown): ChatStreamEvent {
  if (err instanceof ApiError) {
    return {
      type: "error",
      code: err.code,
      message: err.message,
      recoverable: err.recoverable,
    };
  }
  console.error("[chat-stream] unexpected error", err);
  return {
    type: "error",
    code: "INTERNAL_ERROR",
    message: err instanceof Error ? err.message : "Unexpected server error",
    recoverable: false,
  };
}

/**
 * Server-sent chat stream.
 *
 * Sits alongside the blocking POST on `../message`, which keeps its exact
 * response shape. Frames are `event: <type>` plus a JSON `data:` payload that
 * repeats the type, so both `EventSource` and a hand-rolled fetch reader work.
 */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch (err) {
    const details = err instanceof z.ZodError ? err.flatten() : undefined;
    return Response.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid message payload",
          recoverable: true,
          ...(details ? { details } : {}),
        },
      },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const upstream = new AbortController();

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let clientGone = false;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let turn: Promise<void> | null = null;

  const write = (chunk: string) => {
    if (clientGone || !controller) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      clientGone = true; // socket closed underneath us
    }
  };

  const emit = (event: ChatStreamEvent) => {
    write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const onDisconnect = () => {
    if (clientGone) return;
    clientGone = true;
    // Let the turn land so the persisted message is complete, but bound it so a
    // dropped connection cannot pin an upstream request open forever.
    graceTimer = setTimeout(() => upstream.abort(), DISCONNECT_GRACE_MS);
  };

  req.signal.addEventListener("abort", onDisconnect);

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      // Flush headers immediately so the browser opens the stream now rather
      // than when the first token shows up.
      write(": open\n\n");

      turn = streamChatMessage({
        conversationId: id,
        message: body.message,
        channel: body.channel,
        confirmedWriteTools: body.confirmedWriteTools,
        signal: upstream.signal,
        emit,
      })
        .catch((err) => {
          emit(errorEvent(err));
        })
        .finally(() => {
          if (graceTimer) clearTimeout(graceTimer);
          req.signal.removeEventListener("abort", onDisconnect);
          // Release the upstream socket even on the happy path.
          upstream.abort();
          write("event: done\ndata: {\"type\":\"done\"}\n\n");
          if (!clientGone && controller) {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
          clientGone = true;
        });
    },
    cancel() {
      onDisconnect();
    },
  });

  // Keeps the detached turn alive past the response so persistence completes.
  after(async () => {
    try {
      await turn;
    } catch {
      /* already reported on the stream */
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
