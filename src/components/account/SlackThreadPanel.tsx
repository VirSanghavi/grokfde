"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { formatTime } from "@/lib/utils";
import type { SlackThread } from "@/types/ui";
import { IconX } from "@/components/icons";


export function SlackThreadPanel({
  thread,
  onClose,
}: {
  thread: SlackThread;
  onClose: () => void;
}) {
  const messages = [thread.root, ...thread.replies];

  return (
    <div className="flex h-full flex-col border-l border-border bg-bg-elevated">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
            Slack thread
          </p>
          <p className="text-sm font-semibold text-fg">{thread.channelName}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
          <IconX className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {messages.map((m) => (
          <div key={m.id} className="flex gap-3">
            <Avatar name={m.author} size="sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-fg">{m.author}</span>
                {m.authorRole === "agent" && (
                  <span className="font-mono text-[10px] text-brand">Grok FDE</span>
                )}
                <span className="font-mono text-[10px] text-fg-faint">
                  {formatTime(m.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-fg-secondary">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
