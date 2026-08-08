import type { AgentEvent } from "@/types/ui";
import { cn } from "@/lib/utils";
import { Loader2, Search, Sparkles, Wrench, UserRound, Globe } from "lucide-react";

const iconFor = (type: AgentEvent["type"]) => {
  switch (type) {
    case "searching_knowledge":
      return Search;
    case "searching_web":
      return Globe;
    case "using_tool":
      return Wrench;
    case "generating_image":
    case "generating_architecture":
      return Sparkles;
    case "needs_human":
      return UserRound;
    default:
      return Loader2;
  }
};

export function AgentActivity({
  events,
  className,
  live,
}: {
  events: AgentEvent[];
  className?: string;
  live?: boolean;
}) {
  if (!events.length) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {events.map((event, i) => {
        const Icon = iconFor(event.type);
        return (
          <div
            key={`${event.type}-${i}-${event.label}`}
            className="flex items-center gap-2 font-mono text-xs text-fg-muted animate-fade"
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                live && i === events.length - 1 && "animate-pulse-soft text-brand"
              )}
            />
            <span>{event.label.endsWith("...") ? event.label : `${event.label}...`}</span>
          </div>
        );
      })}
    </div>
  );
}
