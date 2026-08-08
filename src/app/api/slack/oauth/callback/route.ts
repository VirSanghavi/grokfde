import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Slack OAuth callback — exchanges code for bot token.
 * Stores token only if account mapping is provided via state.
 * For hackathon, prefer connect-channel with env token.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error) {
      throw new ApiError("BAD_REQUEST", `Slack OAuth error: ${error}`, { status: 400 });
    }
    if (!code) {
      throw new ApiError("BAD_REQUEST", "Missing OAuth code", { status: 400 });
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return jsonOk({
        ok: false,
        mode: "demo",
        message: "OAuth credentials not configured. Use /api/slack/connect-channel.",
      });
    }

    const redirect =
      process.env.SLACK_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/slack/oauth/callback`;

    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirect,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!data.ok) {
      throw new ApiError("INTERNAL_ERROR", `Slack token exchange failed: ${data.error}`, {
        status: 502,
      });
    }

    // Do not persist blindly without account mapping — return safe metadata
    const team = data.team as { id?: string; name?: string } | undefined;
    return jsonOk({
      ok: true,
      teamId: team?.id,
      teamName: team?.name,
      botUserId: (data.bot_user_id as string) || null,
      // token intentionally omitted from response — set SLACK_BOT_TOKEN env or pass to connect-channel server-side
      next: "POST /api/slack/connect-channel with accountId + channelId (token stays server-side via SLACK_BOT_TOKEN)",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
