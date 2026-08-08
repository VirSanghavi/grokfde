import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { htmlToText, ingestTextKnowledge, sourceToPublic } from "@/lib/server/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  companyId: z.string().uuid(),
  url: z.string().url(),
  title: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());

    const res = await fetch(body.url, {
      headers: { "User-Agent": "GrokFDE-Ingest/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new ApiError("KNOWLEDGE_INGESTION_FAILED", `Failed to fetch URL: ${res.status}`, {
        status: 502,
      });
    }

    const raw = await res.text();
    const contentType = res.headers.get("content-type") || "";
    const text = contentType.includes("html") ? await htmlToText(raw) : raw;

    if (!text || text.length < 20) {
      throw new ApiError("KNOWLEDGE_INGESTION_FAILED", "URL returned insufficient text content", {
        status: 422,
      });
    }

    const source = await ingestTextKnowledge({
      companyId: body.companyId,
      type: "url",
      title: body.title || body.url,
      content: text.slice(0, 100000),
      sourceUrl: body.url,
      contentType: "text/plain",
      filename: "url-source.txt",
    });

    return jsonOk({ source: sourceToPublic(source) }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid URL payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
