"use client";

import { cn } from "@/lib/utils";

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-1 rounded-[var(--radius-md)] border border-border bg-bg-elevated p-1",
        className
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-bg-active text-fg"
                : "text-fg-muted hover:text-fg"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
