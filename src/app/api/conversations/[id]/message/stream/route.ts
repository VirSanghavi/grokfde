import { handleChatMessage } from "@/lib/server/chat-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

function frame(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

/**
 * Server-sent events wrapper around the normal chat turn.
 *
 * SSE rather than a WebSocket: this is one-directional server-to-client for
 * the duration of a single reply, which is exactly what SSE is for. A socket
 * would add connection lifecycle and reconnection handling for no gain.
 *
 * Emits `delta` frames as text arrives, then a final `done` frame carrying the
 * same payload the non-streaming endpoint returns, so the client can settle
 * the persisted message, events and updated memory. On failure it emits an
 * `error` frame — the stream never just stops silently.
 */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  let body: { message?: string; confirmedWriteTools?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!body.message?.trim()) {
    return new Response("message is required", { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      try {
        const response = await handleChatMessage({
          conversationId: id,
          message: body.message!,
          confirmedWriteTools: body.confirmedWriteTools,
          onDelta: (chunk) => safeEnqueue(frame("delta", { text: chunk })),
        });
        safeEnqueue(frame("done", response));
      } catch (err) {
        safeEnqueue(
          frame("error", {
            message: err instanceof Error ? err.message : "Chat failed",
          }),
        );
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops proxies buffering the stream into one lump.
      "X-Accel-Buffering": "no",
    },
  });
}
