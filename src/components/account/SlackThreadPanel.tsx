"use client";

import { Button } from "@/components/ui/Button";
import { cn, formatTime } from "@/lib/utils";
import type { SlackThread } from "@/types/ui";

/**
 * One Slack thread from the shared channel. Every message here is a real row
 * from the conversation the Slack handler writes to, so an empty thread says
 * so rather than drawing an empty bubble.
 */

function roleLabel(role: SlackThread["root"]["authorRole"], agentName: string) {
  if (role === "agent") return agentName;
  if (role === "customer") return "Customer";
  if (role === "vendor") return "Vendor";
  return null;
}

export function SlackThreadPanel({
  thread,
  agentName = "your engineer",
  onClose,
}: {
  thread: SlackThread;
  agentName?: string;
  onClose: () => void;
}) {
  const messages = [thread.root, ...(thread.replies ?? [])].filter(
    (m) => m && m.text?.trim(),
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <p className="text-label">Slack thread</p>
          <p className="mt-0.5 truncate font-mono text-[0.8125rem] text-ink">
            #{thread.channelName.replace(/^#/, "")}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        {messages.length === 0 ? (
          <p className="max-w-[46ch] text-body text-ink-2">
            This thread has no stored messages. {agentName} records what it sends and
            receives in the shared channel, so the thread fills in the moment someone posts.
          </p>
        ) : (
          <ol className="space-y-4">
            {messages.map((m) => {
              const label = roleLabel(m.authorRole, agentName);
              // The agent posts under its own name, so the role would repeat it.
              const role = label === m.author ? null : label;
              return (
                <li key={m.id} className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-body font-medium text-ink">{m.author}</span>
                    {role && (
                      <span
                        className={cn(
                          "font-mono text-[11px]",
                          m.authorRole === "agent" ? "text-ink-2" : "text-ink-4",
                        )}
                      >
                        {role}
                      </span>
                    )}
                    <time dateTime={m.createdAt} className="mono-ts tabular">
                      {formatTime(m.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 max-w-[64ch] text-body break-words whitespace-pre-wrap text-ink-2">
                    {m.text}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
