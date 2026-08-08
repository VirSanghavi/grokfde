import { jsonOk } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns Slack OAuth install URL when SLACK_CLIENT_ID is configured.
 * Hackathon: may return demo instructions instead.
 */
export async function GET() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirect =
    process.env.SLACK_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/slack/oauth/callback`;

  if (!clientId) {
    return jsonOk({
      mode: "demo",
      message:
        "SLACK_CLIENT_ID not set. Use POST /api/slack/connect-channel with a demo channelId, or POST /api/demo/slack-message.",
      connectChannel: "/api/slack/connect-channel",
      demoMessage: "/api/demo/slack-message",
    });
  }

  const scopes = [
    "app_mentions:read",
    "channels:history",
    "chat:write",
    "groups:history",
    "im:history",
  ].join(",");

  const url = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirect)}`;

  return jsonOk({ mode: "oauth", installUrl: url, redirectUri: redirect });
}
