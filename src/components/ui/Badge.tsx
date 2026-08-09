import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "call"
  | "live";

/**
 * A badge is a word, not a capsule. There is no pill, no tinted fill, and no
 * border, because a label wrapped in a box is the most vibe-coded shape in the
 * product. State reads as a small dot plus the word, so colour is never the
 * only signal, and a plain `neutral` label is just text at label weight.
 *
 * "Blocked" is a word. It is not `BLOCKED` inside a red capsule. Pass the
 * label in sentence case; nothing here uppercases it for you.
 */
/* Text takes the `-ink` variant of each status colour, measured down until the
   word clears 4.5:1. `live` and `call` go the other way: the vermilion is
   fill-only, so the word is ink and the dot beside it carries the signal. */
const toneText: Record<Tone, string> = {
  neutral: "text-ink-3",
  accent: "text-ink",
  info: "text-ink-2",
  success: "text-positive-ink",
  warning: "text-caution-ink",
  danger: "text-critical",
  call: "text-ink",
  live: "text-ink",
};

/** `neutral` is a plain label, so it carries no state dot. */
const toneDot: Partial<Record<Tone, string>> = {
  accent: "bg-ink",
  info: "bg-ink-3",
  success: "bg-positive",
  warning: "bg-caution",
  danger: "bg-critical",
  call: "bg-live",
  live: "bg-live",
};

export function Badge({
  children,
  tone = "neutral",
  mono = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  /** Use for IDs, counts, and other tabular values. */
  mono?: boolean;
  className?: string;
}) {
  const dot = toneDot[tone];

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 align-middle",
        "text-[0.75rem] leading-5 font-medium",
        mono && "font-mono tracking-[0.01em] tabular-nums",
        toneText[tone],
        className,
      )}
    >
      {dot && (
        // A genuine status dot, one of the only two round things in the product.
        <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}
