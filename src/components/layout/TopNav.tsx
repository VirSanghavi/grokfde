import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function TopNav({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-h-[72px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-bg-elevated px-5 py-4 sm:px-8",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
