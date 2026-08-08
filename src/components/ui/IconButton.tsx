"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "solid" | "danger";
}

export function IconButton({
  label,
  children,
  className,
  size = "md",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };
  const variants = {
    ghost: "text-fg-secondary hover:bg-bg-hover hover:text-fg",
    solid: "bg-bg-hover text-fg hover:bg-bg-active border border-border",
    danger: "text-danger hover:bg-danger/15",
  };

  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-md)] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
