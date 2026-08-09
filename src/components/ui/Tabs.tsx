"use client";

import { cn } from "@/lib/utils";
import { useRef, type KeyboardEvent } from "react";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Real count from real data, or leave it out. */
  count?: number;
  disabled?: boolean;
}

/**
 * Segmented control. Underline-on-rule rather than a pill inside a pill, so it
 * never reads as a card inside a card. Full arrow-key roving focus.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label = "View",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  /** Accessible name for the tab list. */
  label?: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const enabled = items.filter((item) => !item.disabled);
    if (enabled.length === 0) return;

    const current = enabled.findIndex((item) => item.value === value);
    let next = current;
    if (event.key === "ArrowLeft") next = (current - 1 + enabled.length) % enabled.length;
    if (event.key === "ArrowRight") next = (current + 1) % enabled.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;

    const target = enabled[next];
    if (!target || target.value === value) return;

    event.preventDefault();
    onChange(target.value);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab="${target.value}"]`)
        ?.focus();
    });
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={move}
      className={cn(
        "scrollbar-thin flex items-stretch gap-6 overflow-x-auto border-b border-rule",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            data-tab={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "transition-premium relative -mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2.5 text-[0.9375rem] font-medium whitespace-nowrap",
              "active:scale-[0.98] disabled:active:scale-100",
              active
                ? "border-ink text-ink"
                : "border-transparent text-ink-3 hover:border-rule-strong hover:text-ink",
              item.disabled &&
                "cursor-not-allowed border-transparent text-ink-4 hover:border-transparent hover:text-ink-4",
            )}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "font-mono text-[0.75rem] tabular-nums",
                  active ? "text-ink-3" : "text-ink-4",
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
