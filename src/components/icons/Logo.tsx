import { cn } from "@/lib/utils";

type Variant = "light" | "dark" | "brand";

type LogoProps = {
  className?: string;
  markClassName?: string;
  /** Show the wordmark beside the mark. */
  withWordmark?: boolean;
  /** "light" is for dark stage surfaces. "dark" and "brand" are for paper. */
  variant?: Variant;
  size?: number;
};

/**
 * Grok FDE mark: a dotted signal lattice with a live core.
 *
 * The four cardinal nodes are the four channels Atlas shows up on (chat, call,
 * email, repo). The centre is vermilion because that is the one colour in the
 * system that means "someone is on the line right now".
 */
export function LogoMark({
  className,
  size = 28,
  variant = "brand",
  title,
}: {
  className?: string;
  size?: number;
  variant?: Variant;
  /** Give the mark an accessible name when it is not next to the wordmark. */
  title?: string;
}) {
  const onDark = variant === "light";
  const tile = onDark ? "#FBFAF9" : "#13110F";
  const dot = onDark ? "#13110F" : "#FBFAF9";
  const core = "#D6401F";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="4" fill={tile} />
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
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={i < 4 ? 1.5 : 1.1}
          fill={dot}
          opacity={i < 4 ? 0.92 : 0.5}
        />
      ))}
      <path
        d="M16 8.4v3M16 20.6v3M8.4 16h3M20.6 16h3"
        stroke={dot}
        strokeOpacity="0.42"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="3" fill={core} />
      <circle cx="13.4" cy="13.4" r="0.5" fill={dot} opacity="0.4" />
      <circle cx="18.6" cy="13.4" r="0.5" fill={dot} opacity="0.4" />
      <circle cx="13.4" cy="18.6" r="0.5" fill={dot} opacity="0.4" />
      <circle cx="18.6" cy="18.6" r="0.5" fill={dot} opacity="0.4" />
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
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark
        size={size}
        variant={variant}
        className={markClassName}
        title={withWordmark ? undefined : "Grok FDE"}
      />
      {withWordmark && (
        <LogoWordmark tone={variant === "light" ? "light" : "dark"} />
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
        "text-[0.9375rem] font-semibold tracking-[-0.02em]",
        tone === "light" ? "text-white" : "text-ink",
        className,
      )}
    >
      Grok FDE
    </span>
  );
}
