"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-fg hover:bg-brand-strong active:scale-[0.99] shadow-sm disabled:opacity-50 transition-premium",
  secondary:
    "bg-bg-elevated text-fg border border-border shadow-sm hover:bg-bg-hover active:scale-[0.99] disabled:opacity-50 transition-premium",
  ghost:
    "bg-transparent text-fg-secondary hover:bg-bg-hover hover:text-fg disabled:opacity-50 transition-premium",
  danger:
    "diag-danger hover:opacity-90 active:scale-[0.99] disabled:opacity-50 transition-premium",
  outline:
    "bg-bg-elevated text-fg border border-border-strong hover:bg-bg-hover active:scale-[0.99] disabled:opacity-50 transition-premium",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-10 px-4 text-sm gap-2 rounded-[var(--radius-md)]",
  lg: "h-12 px-5 text-[15px] gap-2.5 rounded-[var(--radius-md)]",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  leftIcon,
  rightIcon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
