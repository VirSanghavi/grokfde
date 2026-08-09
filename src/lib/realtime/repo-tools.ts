import type { VoiceActivityEvent, VoiceToolHandler } from "@/lib/realtime/voice-session";

/**
 * Browser-side handlers for the repository tools the agent can run on a call.
 *
 * Every one of them is a call to our own backend. That is the whole point: the
 * model's tool invocations execute in the browser, so a definition that carried
 * a GitHub token would publish it to every visitor. The browser knows only a
 * conversation id, and the server resolves the company and the repository from
 * it, so nothing here can be pointed at a repository the company did not
 * connect.
 *
 * Each handler also reports what it is doing as a live activity, because a
 * fifteen second silence while the agent reads a file is indistinguishable from
 * a broken call. The row appears when the work starts and settles when it ends.
 */

const LABELS: Record<string, { running: string; done: string }> = {
  list_repository_issues: { running: "Reading open issues", done: "Read open issues" },
  read_repository_map: { running: "Reading the repository", done: "Read the repository" },
  read_repository_file: { running: "Opening a file", done: "Read a file" },
  open_pull_request: { running: "Opening a pull request", done: "Pull request opened" },
};

export function repoToolHandlers(
  conversationId: string,
  onActivity: (event: VoiceActivityEvent) => void,
): Record<string, VoiceToolHandler> {
  const handlers: Record<string, VoiceToolHandler> = {};

  for (const name of Object.keys(LABELS)) {
    handlers[name] = async (args: Record<string, unknown>) => {
      const id = `repo-${name}`;
      const label = LABELS[name]!;
      const detail =
        name === "read_repository_file" && typeof args.path === "string"
          ? args.path
          : undefined;

      onActivity({ type: "using_tool", id, label: label.running, state: "running", detail });

      try {
        const res = await fetch("/api/agent/tools/github", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId, tool: name, input: args ?? {} }),
        });
        const body = await res.json();

        if (!res.ok) {
          const message =
            body?.error?.message ?? "That did not work. The repository could not be reached.";
          onActivity({ type: "using_tool", id, label: label.running, state: "failed", detail });
          // Returned as a RESULT, not thrown. A rejected tool call leaves the
          // model waiting on a reply that never comes, and the call goes silent.
          return { error: message };
        }

        if (body?.error) {
          onActivity({ type: "using_tool", id, label: label.running, state: "failed", detail });
          return body;
        }

        onActivity({
          type: "using_tool",
          id,
          label: label.done,
          state: "done",
          detail:
            name === "open_pull_request" && typeof body?.number === "number"
              ? `#${body.number}`
              : detail,
        });
        return body;
      } catch {
        onActivity({ type: "using_tool", id, label: label.running, state: "failed", detail });
        return { error: "The repository could not be reached just now." };
      }
    };
  }

  return handlers;
}
