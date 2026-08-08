import { z } from "zod";
import { processInboundEmail } from "@/lib/email/inbound";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({
  to: z.string(),
  from: z.string(),
  subject: z.string().optional(),
  text: z.string().min(1),
  companyId: z.string().uuid().optional(),
  companySlug: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let payload: z.infer<typeof Schema>;

    if (contentType.includes("application/json")) {
      payload = Schema.parse(await req.json());
    } else {
      // Resend/webhook form-ish fallback
      const form = await req.formData();
      payload = Schema.parse({
        to: String(form.get("to") ?? form.get("recipient") ?? ""),
        from: String(form.get("from") ?? form.get("sender") ?? ""),
        subject: String(form.get("subject") ?? ""),
        text: String(form.get("text") ?? form.get("body") ?? form.get("html") ?? ""),
        companyId: form.get("companyId") ? String(form.get("companyId")) : undefined,
        companySlug: form.get("companySlug")
          ? String(form.get("companySlug"))
          : undefined,
      });
    }

    const result = await processInboundEmail(payload);
    return jsonOk(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid inbound email payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
