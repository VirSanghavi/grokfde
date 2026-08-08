"use client";

import { cn } from "@/lib/utils";
import { useId, type ReactNode } from "react";

/**
 * Grok FDE icon language — industrial halftone / dotted matrix.
 * No solid fills, no single-stroke outline icons.
 */

const DOT = "#68D391";
const DOT_DIM = "#48BB78";

export type IconProps = {
  className?: string;
  size?: number;
  title?: string;
};

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
  const dots: ReactNode[] = [];
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
  return <g mask={`url(#${maskId})`}>{dots}</g>;
}

function Frame({
  children,
  className,
  size = 20,
  title,
}: {
  children: ReactNode;
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

function useMaskId(prefix: string) {
  return `${prefix}${useId().replace(/:/g, "")}`;
}

function Dotted({
  className,
  size = 20,
  title,
  mask,
  cols = 8,
  rows = 8,
}: IconProps & { mask: (id: string) => ReactNode; cols?: number; rows?: number }) {
  const id = useMaskId("i");
  return (
    <Frame className={className} size={size} title={title}>
      <defs>{mask(id)}</defs>
      <DotField maskId={id} cols={cols} rows={rows} />
    </Frame>
  );
}

/* ── Navigation & brand ─────────────────────────────────────── */

export function IconDashboard(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="2" y="2" width="7" height="7" rx="1.2" fill="white" />
          <rect x="11" y="2" width="7" height="4.5" rx="1.2" fill="white" />
          <rect x="11" y="8.5" width="7" height="9.5" rx="1.2" fill="white" />
          <rect x="2" y="11" width="7" height="7" rx="1.2" fill="white" />
        </mask>
      )}
    />
  );
}

export function IconKnowledge(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path
            d="M3.2 3.2h5.4c.9 0 1.6.35 2.1 1 .5-.65 1.2-1 2.1-1h5.4v11.4c0 .7-.55 1.25-1.25 1.25H11.2c-.65 0-1.2.25-1.65.7L10 16l-.55-.45c-.45-.45-1-.7-1.65-.7H4.45c-.7 0-1.25-.55-1.25-1.25V3.2z"
            fill="white"
          />
        </mask>
      )}
    />
  );
}

export function IconActivity(p: IconProps) {
  return (
    <Dotted
      {...p}
      cols={9}
      rows={7}
      mask={(id) => (
        <mask id={id}>
          <path
            d="M2 14 L5.2 14 L7 6.2 L9.4 16.2 L11.8 9.2 L13.4 14 L18 14"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </mask>
      )}
    />
  );
}

export function IconConversations(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path
            d="M3.2 4h13.6c.8 0 1.4.6 1.4 1.4v7c0 .8-.6 1.4-1.4 1.4H9L5.8 17v-3.2H3.2c-.8 0-1.4-.6-1.4-1.4v-7C1.8 4.6 2.4 4 3.2 4z"
            fill="white"
          />
        </mask>
      )}
    />
  );
}

export function IconMessage(p: IconProps) {
  return <IconConversations {...p} />;
}

export function IconAccounts(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="7" cy="7" r="2.5" fill="white" />
          <circle cx="13.6" cy="7.4" r="2.1" fill="white" />
          <path d="M2.4 16.6c0-2.7 2.1-4.3 4.6-4.3s4.6 1.6 4.6 4.3" fill="white" />
          <path d="M11 16.6c.25-2.1 1.7-3.5 3.7-3.5 1.85 0 3.3 1.25 3.5 3.5" fill="white" />
        </mask>
      )}
    />
  );
}

export function IconBuilding(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M4 17.2V4.5c0-.6.45-1.1 1.05-1.1h9.9c.6 0 1.05.5 1.05 1.1v12.7" fill="white" />
          <path d="M2.5 17.2h15" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="6.2" y="6" width="2" height="2" fill="black" />
          <rect x="9" y="6" width="2" height="2" fill="black" />
          <rect x="11.8" y="6" width="2" height="2" fill="black" />
          <rect x="6.2" y="9.2" width="2" height="2" fill="black" />
          <rect x="9" y="9.2" width="2" height="2" fill="black" />
          <rect x="11.8" y="9.2" width="2" height="2" fill="black" />
          <rect x="8.2" y="13.2" width="3.6" height="4" fill="black" />
        </mask>
      )}
    />
  );
}

export function IconAgent(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="3.8" y="5.4" width="12.4" height="10.2" rx="2.4" fill="white" />
          <rect x="9" y="2.4" width="2" height="3.2" rx="0.6" fill="white" />
          <circle cx="7.4" cy="10" r="1.15" fill="black" />
          <circle cx="12.6" cy="10" r="1.15" fill="black" />
          <path d="M7.4 13.2h5.2" stroke="black" strokeWidth="1.25" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconUser(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="10" cy="7" r="3" fill="white" />
          <path d="M3.2 17c0-3.2 2.8-5.2 6.8-5.2s6.8 2 6.8 5.2" fill="white" />
        </mask>
      )}
    />
  );
}

export function IconChart(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="3" y="11" width="3.2" height="6" rx="0.8" fill="white" />
          <rect x="8.4" y="7" width="3.2" height="10" rx="0.8" fill="white" />
          <rect x="13.8" y="4" width="3.2" height="13" rx="0.8" fill="white" />
        </mask>
      )}
    />
  );
}

export function IconLightbulb(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path
            d="M10 2.6c-2.9 0-5.2 2.2-5.2 5 0 1.8.9 3.1 2.1 4.1.5.4.8.9.9 1.5h4.4c.1-.6.4-1.1.9-1.5 1.2-1 2.1-2.3 2.1-4.1 0-2.8-2.3-5-5.2-5z"
            fill="white"
          />
          <rect x="7.6" y="14.2" width="4.8" height="1.4" rx="0.5" fill="white" />
          <rect x="8.1" y="16" width="3.8" height="1.2" rx="0.4" fill="white" />
        </mask>
      )}
    />
  );
}

export function IconLayers(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M10 2.8 L17.2 6.4 L10 10 L2.8 6.4 Z" fill="white" />
          <path d="M2.8 10 L10 13.6 L17.2 10" stroke="white" strokeWidth="1.8" fill="none" />
          <path d="M2.8 13.4 L10 17 L17.2 13.4" stroke="white" strokeWidth="1.8" fill="none" />
        </mask>
      )}
    />
  );
}

export function IconDeploy(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M10 2.4 L16.6 15.6 H3.4 Z" fill="white" />
          <path d="M10 7.4 V13.4" stroke="black" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M7.7 11 L10 13.5 L12.3 11" stroke="black" strokeWidth="1.4" fill="none" />
        </mask>
      )}
    />
  );
}

export function IconMcp(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="10" cy="10" r="2.2" fill="white" />
          <circle cx="10" cy="3.7" r="1.55" fill="white" />
          <circle cx="10" cy="16.3" r="1.55" fill="white" />
          <circle cx="3.7" cy="10" r="1.55" fill="white" />
          <circle cx="16.3" cy="10" r="1.55" fill="white" />
          <circle cx="5.4" cy="5.4" r="1.35" fill="white" />
          <circle cx="14.6" cy="5.4" r="1.35" fill="white" />
          <circle cx="5.4" cy="14.6" r="1.35" fill="white" />
          <circle cx="14.6" cy="14.6" r="1.35" fill="white" />
        </mask>
      )}
    />
  );
}

export function IconTerminal(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="2" y="3" width="16" height="14" rx="2" fill="white" />
          <rect x="3.1" y="4.1" width="13.8" height="2.1" rx="0.5" fill="black" />
          <path d="M6 10 L8.3 12 L6 14" stroke="black" strokeWidth="1.4" fill="none" />
          <path d="M9.6 14 H13.6" stroke="black" strokeWidth="1.4" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="10" cy="10" r="2.3" fill="white" />
          <path
            d="M10 2.7l1.05 1.65 1.95-.4.95 1.75 1.85.55-.3 1.95 1.55 1.25-1.05 1.65.3 1.95-1.85.55-.95 1.75-1.95-.4L10 17.3l-1.05-1.65-1.95.4-.95-1.75-1.85-.55.3-1.95L2.95 10l1.05-1.65-.3-1.95 1.85-.55.95-1.75 1.95.4L10 2.7z"
            fill="white"
          />
          <circle cx="10" cy="10" r="1.35" fill="black" />
        </mask>
      )}
    />
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="8.4" cy="8.4" r="4.3" stroke="white" strokeWidth="2" fill="none" />
          <path d="M11.8 11.8 L16.6 16.6" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconServer(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="3" y="3" width="14" height="4.2" rx="1.1" fill="white" />
          <rect x="3" y="8" width="14" height="4.2" rx="1.1" fill="white" />
          <rect x="3" y="13" width="14" height="4.2" rx="1.1" fill="white" />
          <circle cx="5.6" cy="5.1" r="0.7" fill="black" />
          <circle cx="5.6" cy="10.1" r="0.7" fill="black" />
          <circle cx="5.6" cy="15.1" r="0.7" fill="black" />
        </mask>
      )}
    />
  );
}

export function IconCode(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M7.2 4.5 L3.2 10 L7.2 15.5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M12.8 4.5 L16.8 10 L12.8 15.5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M11.2 3.8 L8.8 16.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconFile(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M5 2.8h6.2L15.2 7v10.2c0 .7-.55 1.2-1.2 1.2H5c-.7 0-1.2-.5-1.2-1.2V4c0-.7.5-1.2 1.2-1.2z" fill="white" />
          <path d="M11 2.8V7h4.2" fill="black" opacity="0.35" />
          <path d="M6.5 10.2h7M6.5 12.6h7M6.5 15h4.5" stroke="black" strokeWidth="1.1" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconFileCode(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M5 2.8h6.2L15.2 7v10.2c0 .7-.55 1.2-1.2 1.2H5c-.7 0-1.2-.5-1.2-1.2V4c0-.7.5-1.2 1.2-1.2z" fill="white" />
          <path d="M7.2 11.2 L5.8 13 L7.2 14.8" stroke="black" strokeWidth="1.2" fill="none" />
          <path d="M12.8 11.2 L14.2 13 L12.8 14.8" stroke="black" strokeWidth="1.2" fill="none" />
          <path d="M11 10.4 L9 15.4" stroke="black" strokeWidth="1.15" />
        </mask>
      )}
    />
  );
}

export function IconGlobe(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.8" fill="none" />
          <ellipse cx="10" cy="10" rx="3.2" ry="7" stroke="white" strokeWidth="1.4" fill="none" />
          <path d="M3.2 10h13.6M4.2 6.4h11.6M4.2 13.6h11.6" stroke="white" strokeWidth="1.3" />
        </mask>
      )}
    />
  );
}

export function IconLink(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path
            d="M8.2 11.8a3.4 3.4 0 0 1 0-4.8l2-2a3.4 3.4 0 0 1 4.8 4.8l-1 1"
            stroke="white"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M11.8 8.2a3.4 3.4 0 0 1 0 4.8l-2 2a3.4 3.4 0 1 1-4.8-4.8l1-1"
            stroke="white"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
        </mask>
      )}
    />
  );
}

export function IconUpload(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M10 13.8V4.2" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <path d="M6.2 7.4 L10 3.5 L13.8 7.4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M4 16.2h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M10 4v12M4 10h12" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M4.2 10.4 L8.2 14.2 L15.8 5.8" stroke="white" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      )}
    />
  );
}

export function IconCheckCircle(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="10" cy="10" r="7.2" fill="white" />
          <path d="M6.2 10.2 L8.8 12.7 L13.9 7.2" stroke="black" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconX(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M5 5 L15 15M15 5 L5 15" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconXCircle(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="10" cy="10" r="7.2" fill="white" />
          <path d="M7 7 L13 13M13 7 L7 13" stroke="black" strokeWidth="1.6" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconCircle(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="10" cy="10" r="6.5" stroke="white" strokeWidth="2" fill="none" />
        </mask>
      )}
    />
  );
}

export function IconArrowLeft(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M16 10H5.2" stroke="white" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M9.2 5.5 L4.5 10 L9.2 14.5" stroke="white" strokeWidth="2.1" fill="none" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconArrowRight(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M4 10h10.8" stroke="white" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M10.8 5.5 L15.5 10 L10.8 14.5" stroke="white" strokeWidth="2.1" fill="none" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconExternalLink(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M8.2 4.2H4.5A1.8 1.8 0 0 0 2.7 6v9.5A1.8 1.8 0 0 0 4.5 17.3H14a1.8 1.8 0 0 0 1.8-1.8v-3.7" stroke="white" strokeWidth="1.7" fill="none" />
          <path d="M11 3.2h5.8V9" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M10.2 9.8 L16.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconCopy(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="7" y="5.5" width="9.2" height="11" rx="1.4" fill="white" />
          <rect x="3.8" y="3.2" width="9.2" height="11" rx="1.4" fill="white" />
          <rect x="5" y="4.5" width="6.8" height="8.4" rx="0.6" fill="black" opacity="0.25" />
        </mask>
      )}
    />
  );
}

export function IconRefresh(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M15.8 10a5.8 5.8 0 1 1-1.4-3.7" stroke="white" strokeWidth="1.9" fill="none" strokeLinecap="round" />
          <path d="M15.8 3.8v4.2h-4.2" stroke="white" strokeWidth="1.9" fill="none" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconPlay(p: IconProps) {
  return (
    <Dotted
      {...p}
      cols={6}
      rows={7}
      mask={(id) => (
        <mask id={id}>
          <path d="M7 4.2 L15.8 10 L7 15.8 Z" fill="white" />
        </mask>
      )}
    />
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M4 6h12M4 10h12M4 14h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconPanelRight(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="2.5" y="3.2" width="15" height="13.6" rx="1.6" fill="white" />
          <rect x="12.2" y="4.5" width="3.8" height="11" rx="0.6" fill="black" />
        </mask>
      )}
    />
  );
}

export function IconSend(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M3.2 9.6 L16.8 3.5 L12.2 16.5 L9.4 11.2 Z" fill="white" />
          <path d="M9.4 11.2 L16.8 3.5" stroke="black" strokeWidth="1.2" />
        </mask>
      )}
    />
  );
}

export function IconMail(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="2.5" y="4.5" width="15" height="11" rx="1.6" fill="white" />
          <path d="M3.5 6 L10 11.2 L16.5 6" stroke="black" strokeWidth="1.4" fill="none" />
        </mask>
      )}
    />
  );
}

export function IconPhone(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path
            d="M6.2 2.8h2.6c.55 0 1 .4 1.1.95l.45 2.4c.08.45-.1.9-.48 1.15l-1.3.85a10.2 10.2 0 0 0 4.1 4.1l.85-1.3c.25-.38.7-.56 1.15-.48l2.4.45c.55.1.95.55.95 1.1v2.6c0 .6-.5 1.1-1.1 1.1C9.4 17 3 10.6 3 3.9c0-.6.5-1.1 1.1-1.1h2.1z"
            fill="white"
          />
        </mask>
      )}
    />
  );
}

export function IconPhoneOff(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path
            d="M6.2 2.8h2.6c.55 0 1 .4 1.1.95l.45 2.4c.08.45-.1.9-.48 1.15l-1.3.85a10.2 10.2 0 0 0 4.1 4.1l.85-1.3c.25-.38.7-.56 1.15-.48l2.4.45c.55.1.95.55.95 1.1v2.6c0 .6-.5 1.1-1.1 1.1C9.4 17 3 10.6 3 3.9c0-.6.5-1.1 1.1-1.1h2.1z"
            fill="white"
          />
          <path d="M4 4 L16 16" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconMic(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="7.4" y="2.8" width="5.2" height="8.2" rx="2.6" fill="white" />
          <path d="M5 9.5a5 5 0 0 0 10 0" stroke="white" strokeWidth="1.7" fill="none" />
          <path d="M10 14.5v2.7M7.2 17.2h5.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconMicOff(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="7.4" y="2.8" width="5.2" height="8.2" rx="2.6" fill="white" />
          <path d="M5 9.5a5 5 0 0 0 10 0" stroke="white" strokeWidth="1.7" fill="none" />
          <path d="M10 14.5v2.7M7.2 17.2h5.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M4.2 4.2 L15.8 15.8" stroke="black" strokeWidth="1.8" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconVolume(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M3.5 7.5h3.2L11 4.2v11.6L6.7 12.5H3.5z" fill="white" />
          <path d="M13.2 7.2a3.2 3.2 0 0 1 0 5.6M15.2 5.4a5.4 5.4 0 0 1 0 9.2" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconSubtitles(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <rect x="2.5" y="4" width="15" height="12" rx="1.6" fill="white" />
          <path d="M5 12.5h4.5M11 12.5h4M5 14.5h7" stroke="black" strokeWidth="1.2" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconWrench(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path
            d="M13.8 3.2a3.6 3.6 0 0 0-4.6 4.6L4 13l3 3 5.2-5.2a3.6 3.6 0 0 0 4.6-4.6l-2.4 2.4-2.2-2.2 2.4-2.4z"
            fill="white"
          />
        </mask>
      )}
    />
  );
}

export function IconSparkles(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M10 2.5l1.3 4.2L15.5 8l-4.2 1.3L10 13.5l-1.3-4.2L4.5 8l4.2-1.3z" fill="white" />
          <path d="M15.2 11.5l.7 2.2 2.2.7-2.2.7-.7 2.2-.7-2.2-2.2-.7 2.2-.7z" fill="white" />
        </mask>
      )}
    />
  );
}

export function IconShield(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M10 2.5 L16.5 5v4.8c0 3.6-2.5 6.5-6.5 7.7C6 16.3 3.5 13.4 3.5 9.8V5z" fill="white" />
          <path d="M7.2 10.1 L9.2 12.1 L13 7.8" stroke="black" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </mask>
      )}
    />
  );
}

export function IconAlert(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M10 2.8 L18 16.5 H2 Z" fill="white" />
          <path d="M10 7.5v4.2" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="10" cy="13.8" r="0.85" fill="black" />
        </mask>
      )}
    />
  );
}

export function IconGitPR(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <circle cx="6" cy="5" r="2" fill="white" />
          <circle cx="6" cy="15" r="2" fill="white" />
          <circle cx="14.5" cy="15" r="2" fill="white" />
          <path d="M6 7v6" stroke="white" strokeWidth="1.7" />
          <path d="M14.5 13V8.5A3.5 3.5 0 0 0 11 5H9.5" stroke="white" strokeWidth="1.7" fill="none" />
        </mask>
      )}
    />
  );
}

export function IconFolderGit(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M2.8 5.5h5.2l1.4 1.5h7.8c.7 0 1.2.5 1.2 1.2v7.3c0 .7-.5 1.2-1.2 1.2H2.8c-.7 0-1.2-.5-1.2-1.2V6.7c0-.7.5-1.2 1.2-1.2z" fill="white" />
          <circle cx="8" cy="12" r="1.3" fill="black" />
          <circle cx="13" cy="12" r="1.3" fill="black" />
          <path d="M9.3 12h2.4" stroke="black" strokeWidth="1.2" />
        </mask>
      )}
    />
  );
}

export function IconFlask(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M8 3.2h4v5.2l3.8 7.4c.35.7-.15 1.5-.95 1.5H5.15c-.8 0-1.3-.8-.95-1.5L8 8.4V3.2z" fill="white" />
          <path d="M7.2 3.2h5.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M6.5 13.5h7" stroke="black" strokeWidth="1.2" opacity="0.4" />
        </mask>
      )}
    />
  );
}

export function IconLoader({ className, size = 20, title }: IconProps) {
  const id = useMaskId("spin");
  return (
    <Frame className={cn("animate-spin", className)} size={size} title={title}>
      <defs>
        <mask id={id}>
          <circle cx="10" cy="10" r="7" stroke="white" strokeWidth="2.2" fill="none" strokeDasharray="28 14" />
        </mask>
      </defs>
      <DotField maskId={id} cols={8} rows={8} fade={false} />
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
    <svg width="10" height="10" viewBox="0 0 10 10" className={cn("shrink-0", className)} aria-hidden>
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

export function IconPlayFilled(p: IconProps) {
  return <IconPlay {...p} />;
}

export function IconDiamond(p: IconProps) {
  return (
    <Dotted
      {...p}
      mask={(id) => (
        <mask id={id}>
          <path d="M10 2.5 L17 10 L10 17.5 L3 10 Z" fill="white" />
        </mask>
      )}
    />
  );
}

/* Aliases matching prior lucide names for easy swap */
export const IconMessageSquare = IconConversations;
export const IconFileText = IconFile;
export const IconFileCode2 = IconFileCode;
export const IconLink2 = IconLink;
export const IconArrowLeftIcon = IconArrowLeft;
export const IconBuilding2 = IconBuilding;
export const IconCode2 = IconCode;
export const IconGitPullRequest = IconGitPR;
export const IconLoader2 = IconLoader;
export const IconRotateCcw = IconRefresh;
export const IconAlertTriangle = IconAlert;
export const IconCheckCircle2 = IconCheckCircle;
export const IconXCircleIcon = IconXCircle;
export const IconVolume2 = IconVolume;
export const IconUserRound = IconUser;
