import { cn } from "@/lib/utils";

type Status =
  | "ready"
  | "processing"
  | "online"
  | "offline"
  | "error"
  | "listening"
  | "connected"
  | "needs_human";

const colors: Record<Status, string> = {
  ready: "bg-success",
  processing: "bg-warning",
  online: "bg-success",
  offline: "bg-fg-faint",
  error: "bg-danger",
  listening: "bg-call",
  connected: "bg-call",
  needs_human: "bg-danger",
};

export function StatusDot({
  status,
  pulse,
  className,
}: {
  status: Status;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        colors[status],
        pulse && "animate-pulse-soft",
        className
      )}
    />
  );
}
