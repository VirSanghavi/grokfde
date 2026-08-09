"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Announced while loading, and used as the accessible busy label. */
  loadingLabel?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * One primary action per view. Primary is solid ink, secondary is a hairline,
 * ghost is text only. Disabled loses its emphasis, not just its opacity.
 */
const variants: Record<Variant, string> = {
  primary: [
    "bg-ink text-paper shadow-[var(--elevation-1)]",
    "hover:bg-ink-lift",
    "disabled:bg-sunken disabled:text-ink-4 disabled:shadow-none",
  ].join(" "),
  secondary: [
    "bg-surface text-ink border border-rule shadow-[var(--elevation-1)]",
    "hover:bg-hover hover:border-rule-strong",
    "disabled:bg-sunken disabled:text-ink-4 disabled:border-rule disabled:shadow-none",
  ].join(" "),
  outline: [
    "bg-transparent text-ink border border-rule-strong",
    "hover:bg-hover",
    "disabled:text-ink-4 disabled:border-rule",
  ].join(" "),
  ghost: [
    "bg-transparent text-ink-2",
    "hover:bg-hover hover:text-ink",
    "disabled:text-ink-4 disabled:hover:bg-transparent",
  ].join(" "),
  danger: [
    "bg-critical text-white shadow-[var(--elevation-1)]",
    "hover:bg-critical-strong",
    "disabled:bg-sunken disabled:text-ink-4 disabled:shadow-none",
  ].join(" "),
};

const sizes: Record<Size, string> = {
  sm: "h-10 px-3 text-[0.8125rem]",
  md: "h-11 px-4 text-[0.9375rem]",
  lg: "h-12 px-5 text-base",
};

const spinnerSize: Record<Size, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-4 w-4",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  leftIcon,
  rightIcon,
  children,
  disabled,
  type = "button",
  fullWidth,
  "aria-label": ariaLabel,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      {...props}
      className={cn(
        "transition-premium inline-flex select-none items-center justify-center gap-2",
        "rounded-[var(--radius-control)] font-medium tracking-[-0.005em] whitespace-nowrap",
        "active:scale-[0.99] disabled:cursor-not-allowed disabled:active:scale-100",
        "[@media(pointer:coarse)]:min-h-11",
        fullWidth && "w-full",
        sizes[size],
        variants[variant],
        className,
      )}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-label={loading && loadingLabel ? loadingLabel : ariaLabel}
    >
      {loading ? (
        <span
          aria-hidden
          className={cn(
            "shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent",
            spinnerSize[size],
          )}
        />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
