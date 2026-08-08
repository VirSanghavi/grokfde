import type { AgentEvent } from "@/types/ui";
import { cn } from "@/lib/utils";
import { IconGlobe, IconLoader, IconSearch, IconSparkles, IconUser, IconWrench } from "@/components/icons";


const iconFor = (type: AgentEvent["type"]) => {
  switch (type) {
    case "searching_knowledge":
      return IconSearch;
    case "searching_web":
      return IconGlobe;
    case "using_tool":
      return IconWrench;
    case "generating_image":
    case "generating_architecture":
      return IconSparkles;
    case "needs_human":
      return IconUser;
    default:
      return IconLoader;
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
