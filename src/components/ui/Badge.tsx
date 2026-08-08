import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "call";

const tones: Record<Tone, string> = {
  neutral: "bg-bg-hover text-fg-secondary border-border",
  accent: "bg-accent-dim text-fg border-accent-border",
  success: "diag-success",
  warning: "diag-warning",
  danger: "diag-danger",
  info: "diag-info",
  call: "diag-info",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.05em]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
