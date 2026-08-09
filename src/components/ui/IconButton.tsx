"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Size = "sm" | "md" | "lg";
type Variant = "ghost" | "solid" | "outline" | "danger" | "live";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required. Becomes both the accessible name and the tooltip. */
  label: string;
  children: ReactNode;
  size?: Size;
  variant?: Variant;
}

/**
 * Icon-only control. Dense chrome keeps the compact box on a mouse, and any
 * coarse pointer gets a real 44x44 target without overlapping its neighbours.
 */
const sizes: Record<Size, string> = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-11 w-11",
};

const variants: Record<Variant, string> = {
  ghost: [
    "text-ink-2 hover:bg-hover hover:text-ink",
    "disabled:text-ink-4 disabled:hover:bg-transparent",
  ].join(" "),
  solid: [
    "border border-rule bg-surface text-ink shadow-[var(--elevation-1)] hover:bg-hover",
    "disabled:border-rule disabled:bg-sunken disabled:text-ink-4 disabled:shadow-none",
  ].join(" "),
  outline: [
    "border border-rule-strong text-ink hover:bg-hover",
    "disabled:border-rule disabled:text-ink-4",
  ].join(" "),
  danger: [
    "text-critical hover:bg-critical-soft",
    "disabled:text-ink-4 disabled:hover:bg-transparent",
  ].join(" "),
  live: [
    // Live is fill-only, so the resting icon is ink on the live tint and the
    // vermilion takes over as a solid fill on hover.
    "border border-live-rule bg-live-soft text-ink hover:bg-live hover:text-white",
    "disabled:border-rule disabled:bg-sunken disabled:text-ink-4",
  ].join(" "),
};

export function IconButton({
  label,
  children,
  className,
  size = "md",
  variant = "ghost",
  type = "button",
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      {...props}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "transition-premium relative inline-flex shrink-0 items-center justify-center",
        "rounded-[var(--radius-control)] active:scale-[0.96] disabled:cursor-not-allowed disabled:active:scale-100",
        "[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
        sizes[size],
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
