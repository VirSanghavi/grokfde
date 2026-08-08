import { Badge } from "@/components/ui/Badge";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Channel } from "@/types/ui";

const channelTone: Record<Channel, "neutral" | "info" | "call" | "accent"> = {
  chat: "info",
  email: "neutral",
  call: "call",
  system: "accent",
};

export function ConversationRow({
  name,
  channel,
  preview,
  updatedAt,
  active,
  onClick,
}: {
  name: string;
  channel: Channel;
  preview: string;
  updatedAt: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-1.5 border-b border-border px-4 py-3.5 text-left transition-colors",
        active ? "bg-bg-hover" : "bg-bg-elevated hover:bg-bg-hover"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-fg">{name}</span>
        <span className="shrink-0 font-mono text-[11px] text-fg-faint">
          {formatRelativeTime(updatedAt)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={channelTone[channel]}>{channel}</Badge>
        <span className="truncate text-xs text-fg-muted">{preview}</span>
      </div>
    </button>
  );
}
