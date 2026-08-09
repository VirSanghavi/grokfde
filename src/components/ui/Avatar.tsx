import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";
type Tone = "person" | "agent";

const sizes: Record<Size, string> = {
  sm: "h-8 w-8 text-[0.625rem]",
  md: "h-10 w-10 text-[0.6875rem]",
  lg: "h-12 w-12 text-[0.8125rem]",
  xl: "h-16 w-16 text-base",
};

const tones: Record<Tone, string> = {
  person: "border border-rule-strong bg-sunken text-ink-2",
  agent: "bg-ink text-paper",
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/**
 * Initials avatar. Mono initials keep it reading as a record, not a sticker.
 * `tone="agent"` is the solid ink mark used for Atlas.
 */
export function Avatar({
  name,
  size = "md",
  tone = "agent",
  src,
  live = false,
  className,
}: {
  name: string;
  size?: Size;
  tone?: Tone;
  /** Real image URL. Falls back to initials when absent. */
  src?: string | null;
  /** Marks a genuinely live speaker with the accent ring. */
  live?: boolean;
  className?: string;
}) {
  const content = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    <span aria-hidden className="font-mono leading-none font-medium tracking-[0.02em]">
      {initialsOf(name)}
    </span>
  );

  return (
    <span
      // Initials repeat a name that is always rendered beside the avatar, so
      // the decorative form stays out of the accessibility tree.
      aria-hidden={src ? undefined : true}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full select-none",
        tones[tone],
        sizes[size],
        live && "ring-2 ring-live ring-offset-2 ring-offset-paper",
        className,
      )}
    >
      {content}
    </span>
  );
}
