"use client";

import { cn } from "@/lib/utils";
import { useId } from "react";

/**
 * Halftone / industrial dotted icon language.
 * Geometry is composed of a uniform circle grid with edge fade — never solid fills or thin outlines.
 */

const DOT = "#68D391";
const DOT_DIM = "#48BB78";

function DotField({
  maskId,
  cols = 7,
  rows = 7,
  size = 20,
  fade = true,
}: {
  maskId: string;
  cols?: number;
  rows?: number;
  size?: number;
  fade?: boolean;
}) {
  const cx0 = size / (cols + 1);
  const cy0 = size / (rows + 1);
  const r = Math.max(0.55, size * 0.045);
  const dots: React.ReactNode[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const nx = cols <= 1 ? 0.5 : x / (cols - 1);
      const ny = rows <= 1 ? 0.5 : y / (rows - 1);
      const edge = Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 2;
      const opacity = fade ? Math.max(0.18, 1 - edge * 0.85) : 0.9;
      dots.push(
        <circle
          key={`${x}-${y}`}
          cx={cx0 * (x + 1)}
          cy={cy0 * (y + 1)}
          r={r}
          fill={opacity > 0.55 ? DOT : DOT_DIM}
          opacity={opacity}
        />,
      );
    }
  }
  return (
    <g mask={`url(#${maskId})`}>
      {dots}
    </g>
  );
}

type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

function Frame({
  children,
  className,
  size = 20,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconDashboard({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <rect x="2" y="2" width="7" height="7" rx="1.2" fill="white" />
          <rect x="11" y="2" width="7" height="4.5" rx="1.2" fill="white" />
          <rect x="11" y="8.5" width="7" height="9.5" rx="1.2" fill="white" />
          <rect x="2" y="11" width="7" height="7" rx="1.2" fill="white" />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={8} />
    </Frame>
  );
}

export function IconKnowledge({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <path
            d="M4 3.5h5.2c.9 0 1.6.3 2.1.9.5-.6 1.2-.9 2.1-.9H18.5v11.2c0 .7-.6 1.3-1.3 1.3H12c-.7 0-1.3.2-1.8.7l-.2.2-.2-.2c-.5-.5-1.1-.7-1.8-.7H3.3c-.7 0-1.3-.6-1.3-1.3V3.5H4z"
            fill="white"
          />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={9} />
    </Frame>
  );
}

export function IconActivity({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <path
            d="M2 14 L5.5 14 L7.2 6.5 L9.5 16.5 L11.8 9.5 L13.5 14 L18 14"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </mask>
      </defs>
      <DotField maskId={id} cols={9} rows={7} />
    </Frame>
  );
}

export function IconTerminal({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <rect x="2" y="3" width="16" height="14" rx="2" fill="white" />
          <rect x="3.2" y="4.2" width="13.6" height="2.2" rx="0.6" fill="black" />
          <path d="M6 10 L8.2 12 L6 14" stroke="black" strokeWidth="1.4" fill="none" />
          <path d="M9.5 14 H13.5" stroke="black" strokeWidth="1.4" strokeLinecap="round" />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={8} />
    </Frame>
  );
}

export function IconMcp({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <circle cx="10" cy="10" r="2.2" fill="white" />
          <circle cx="10" cy="3.8" r="1.6" fill="white" />
          <circle cx="10" cy="16.2" r="1.6" fill="white" />
          <circle cx="3.8" cy="10" r="1.6" fill="white" />
          <circle cx="16.2" cy="10" r="1.6" fill="white" />
          <circle cx="5.5" cy="5.5" r="1.4" fill="white" />
          <circle cx="14.5" cy="5.5" r="1.4" fill="white" />
          <circle cx="5.5" cy="14.5" r="1.4" fill="white" />
          <circle cx="14.5" cy="14.5" r="1.4" fill="white" />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={8} />
    </Frame>
  );
}

export function IconDeploy({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <path d="M10 2.5 L16.5 15.5 H3.5 Z" fill="white" />
          <path d="M10 7.5 V13.5" stroke="black" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M7.8 11.2 L10 13.6 L12.2 11.2" stroke="black" strokeWidth="1.4" fill="none" />
        </mask>
      </defs>
      <DotField maskId={id} cols={7} rows={8} />
    </Frame>
  );
}

export function IconAccounts({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <circle cx="7" cy="7" r="2.4" fill="white" />
          <circle cx="13.5" cy="7.5" r="2" fill="white" />
          <path d="M2.5 16.5c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2" fill="white" />
          <path d="M11 16.5c.2-2 1.6-3.4 3.6-3.4 1.8 0 3.2 1.2 3.4 3.4" fill="white" />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={8} />
    </Frame>
  );
}

export function IconSettings({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <circle cx="10" cy="10" r="2.4" fill="white" />
          <path
            d="M10 2.8l1.1 1.7 2-.4 1 1.8 1.9.6-.3 2 1.6 1.3-1.1 1.7.3 2-1.9.6-1 1.8-2-.4L10 17.2l-1.1-1.7-2 .4-1-1.8-1.9-.6.3-2L2.7 10l1.1-1.7-.3-2 1.9-.6 1-1.8 2 .4L10 2.8z"
            fill="white"
          />
          <circle cx="10" cy="10" r="1.4" fill="black" />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={8} />
    </Frame>
  );
}

export function IconSearch({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <circle cx="8.5" cy="8.5" r="4.2" stroke="white" strokeWidth="2" fill="none" />
          <path d="M12 12 L16.5 16.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={8} />
    </Frame>
  );
}

export function IconStatusDot({
  className,
  tone = "success",
}: {
  className?: string;
  tone?: "success" | "info" | "warning" | "danger" | "idle";
}) {
  const fill =
    tone === "success"
      ? "#10B981"
      : tone === "info"
        ? "#3182CE"
        : tone === "warning"
          ? "#DD6B20"
          : tone === "danger"
            ? "#E53E3E"
            : "#94A3B8";
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className={cn("shrink-0", className)}>
      <circle cx="5" cy="5" r="1.1" fill={fill} opacity="0.95" />
      <circle cx="3.2" cy="3.4" r="0.7" fill={fill} opacity="0.55" />
      <circle cx="6.8" cy="3.4" r="0.7" fill={fill} opacity="0.55" />
      <circle cx="3.2" cy="6.6" r="0.7" fill={fill} opacity="0.55" />
      <circle cx="6.8" cy="6.6" r="0.7" fill={fill} opacity="0.55" />
      <circle cx="5" cy="2.4" r="0.55" fill={fill} opacity="0.35" />
      <circle cx="5" cy="7.6" r="0.55" fill={fill} opacity="0.35" />
    </svg>
  );
}

export function IconPlay({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <path d="M7 4.5 L15.5 10 L7 15.5 Z" fill="white" />
        </mask>
      </defs>
      <DotField maskId={id} cols={6} rows={7} />
    </Frame>
  );
}

export function IconDiamond({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <path d="M10 2.5 L17 10 L10 17.5 L3 10 Z" fill="white" />
        </mask>
      </defs>
      <DotField maskId={id} cols={7} rows={7} />
    </Frame>
  );
}

export function IconChart({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <rect x="3" y="11" width="3.2" height="6" rx="0.8" fill="white" />
          <rect x="8.4" y="7" width="3.2" height="10" rx="0.8" fill="white" />
          <rect x="13.8" y="4" width="3.2" height="13" rx="0.8" fill="white" />
        </mask>
      </defs>
      <DotField maskId={id} cols={7} rows={8} />
    </Frame>
  );
}

export function IconConversations({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <path
            d="M3.5 4.2h13c.8 0 1.5.7 1.5 1.5v7c0 .8-.7 1.5-1.5 1.5H9.2L6 17.2v-2.9H3.5c-.8 0-1.5-.7-1.5-1.5v-7c0-.8.7-1.5 1.5-1.5z"
            fill="white"
          />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={8} />
    </Frame>
  );
}

export function IconAgent({ className, size = 20, title }: IconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>
        <mask id={id}>
          <rect x="4" y="5.5" width="12" height="10" rx="2.2" fill="white" />
          <rect x="9" y="2.5" width="2" height="3.2" rx="0.6" fill="white" />
          <circle cx="7.5" cy="10" r="1.1" fill="black" />
          <circle cx="12.5" cy="10" r="1.1" fill="black" />
          <path d="M7.5 13.2h5" stroke="black" strokeWidth="1.2" strokeLinecap="round" />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={8} />
    </Frame>
  );
}
