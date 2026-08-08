import { jsonOk } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk({
    ok: true,
    service: "grok-fde-intelligence",
    time: new Date().toISOString(),
    models: {
      text: process.env.XAI_TEXT_MODEL || "grok-4.5",
      voice: process.env.XAI_VOICE_MODEL || "grok-voice-latest",
    },
    xaiConfigured: Boolean(process.env.XAI_API_KEY),
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    ),
  });
}
