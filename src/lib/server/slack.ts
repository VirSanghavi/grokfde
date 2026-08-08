/**
 * Slack provider abstraction — real Web API when token present, demo otherwise.
 */

export type SlackPostResult = {
  ok: boolean;
  channel: string;
  ts: string;
  provider: "slack" | "demo";
  text: string;
};

export interface SlackAdapter {
  postMessage(args: {
    channel: string;
    text: string;
    threadTs?: string;
    token?: string | null;
  }): Promise<SlackPostResult>;
}

const demoPosts: SlackPostResult[] = [];

export function getDemoSlackPosts() {
  return [...demoPosts];
}

export function clearDemoSlackPosts() {
  demoPosts.length = 0;
}

class DemoSlackAdapter implements SlackAdapter {
  async postMessage(args: {
    channel: string;
    text: string;
    threadTs?: string;
    token?: string | null;
  }): Promise<SlackPostResult> {
    const result: SlackPostResult = {
      ok: true,
      channel: args.channel,
      ts: `${Date.now() / 1000}.000100`,
      provider: "demo",
      text: args.text,
    };
    demoPosts.push(result);
    console.info("[slack:demo] post", {
      channel: args.channel,
      threadTs: args.threadTs,
      text: args.text.slice(0, 120),
    });
    return result;
  }
}

class RealSlackAdapter implements SlackAdapter {
  async postMessage(args: {
    channel: string;
    text: string;
    threadTs?: string;
    token?: string | null;
  }): Promise<SlackPostResult> {
    const token = args.token || process.env.SLACK_BOT_TOKEN;
    if (!token) return new DemoSlackAdapter().postMessage(args);

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: args.channel,
        text: args.text,
        ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
      }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      ts?: string;
      channel?: string;
      error?: string;
    };
    if (!data.ok) {
      console.warn("[slack] post failed", data.error);
      return new DemoSlackAdapter().postMessage(args);
    }
    return {
      ok: true,
      channel: data.channel || args.channel,
      ts: data.ts || `${Date.now() / 1000}`,
      provider: "slack",
      text: args.text,
    };
  }
}

export function getSlackAdapter(): SlackAdapter {
  if (process.env.SLACK_BOT_TOKEN) return new RealSlackAdapter();
  return new DemoSlackAdapter();
}

export async function postMessage(args: {
  channel: string;
  text: string;
  threadTs?: string;
  token?: string | null;
}) {
  return getSlackAdapter().postMessage(args);
}

export async function replyInThread(args: {
  channel: string;
  threadTs: string;
  text: string;
  token?: string | null;
}) {
  return postMessage({
    channel: args.channel,
    text: args.text,
    threadTs: args.threadTs,
    token: args.token,
  });
}
