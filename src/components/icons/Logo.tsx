import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  markClassName?: string;
  /** show wordmark beside mark */
  withWordmark?: boolean;
  /** light | dark | brand */
  variant?: "light" | "dark" | "brand";
  size?: number;
};

/**
 * Grok FDE mark: a dotted "constellation engineer" node —
 * center agent core with four directional signal nodes (chat/voice/email/code).
 * Industrial halftone language, not a generic letter tile.
 */
export function LogoMark({
  className,
  size = 28,
  variant = "brand",
}: {
  className?: string;
  size?: number;
  variant?: "light" | "dark" | "brand";
}) {
  const bg =
    variant === "brand" ? "#10B981" : variant === "dark" ? "#0F172A" : "#FFFFFF";
  const dot =
    variant === "light" ? "#10B981" : variant === "brand" ? "#ECFDF5" : "#68D391";
  const dim = variant === "light" ? "#48BB78" : "rgba(236,253,245,0.55)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="9" fill={bg} />
      {/* outer constellation ring dots */}
      {[
        [16, 6],
        [26, 16],
        [16, 26],
        [6, 16],
        [22.5, 9.5],
        [22.5, 22.5],
        [9.5, 22.5],
        [9.5, 9.5],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i < 4 ? 1.55 : 1.15} fill={dot} opacity={i < 4 ? 0.95 : 0.55} />
      ))}
      {/* connecting faint lattice */}
      <path
        d="M16 8.2v3.2M16 20.6v3.2M8.2 16h3.2M20.6 16h3.2"
        stroke={dim}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* core agent node */}
      <circle cx="16" cy="16" r="3.1" fill={dot} />
      <circle cx="16" cy="16" r="1.35" fill={bg} opacity="0.35" />
      {/* micro dots for density */}
      <circle cx="13.2" cy="13.2" r="0.55" fill={dot} opacity="0.45" />
      <circle cx="18.8" cy="13.2" r="0.55" fill={dot} opacity="0.45" />
      <circle cx="13.2" cy="18.8" r="0.55" fill={dot} opacity="0.45" />
      <circle cx="18.8" cy="18.8" r="0.55" fill={dot} opacity="0.45" />
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
  withWordmark = true,
  variant = "brand",
  size = 28,
}: LogoProps) {
  const text =
    variant === "light" || variant === "brand"
      ? "text-white"
      : "text-fg";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} variant={variant} className={markClassName} />
      {withWordmark && (
        <span className={cn("text-[15px] font-semibold tracking-tight", text)}>
          Grok FDE
        </span>
      )}
    </span>
  );
}

export function LogoWordmark({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <span
      className={cn(
        "text-[15px] font-semibold tracking-tight",
        tone === "light" ? "text-white" : "text-fg",
        className,
      )}
    >
      Grok FDE
    </span>
  );
}
