import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * The shared vocabulary for the control room. Everything here groups with
 * whitespace and a hairline rule. Nothing here is a card, a pill, or a box
 * inside a box.
 */

export type Tone = "positive" | "caution" | "critical" | "neutral" | "live";

const DOT: Record<Tone, string> = {
  positive: "bg-positive",
  caution: "bg-caution",
  critical: "bg-critical",
  neutral: "bg-ink-4",
  live: "bg-live",
};

const TEXT: Record<Tone, string> = {
  positive: "text-positive",
  caution: "text-caution",
  critical: "text-critical",
  neutral: "text-ink-3",
  live: "text-live",
};

/**
 * A state, written as a word with a dot beside it. Colour never carries the
 * meaning on its own, and the dot is the only round thing in the product.
 */
export function StateMark({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} />
      <span className={cn("font-mono text-[0.75rem] tracking-[0.02em]", TEXT[tone])}>
        {children}
      </span>
    </span>
  );
}

/** The one uppercase tier in the type scale, used sparingly. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-label", className)}>{children}</p>;
}

/**
 * A section is a heading, an optional sentence saying what it is for, and its
 * content. The rule above it is the only container it gets.
 */
export function Section({
  title,
  note,
  action,
  children,
  className,
  id,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("border-t border-rule pt-6", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-title text-ink">{title}</h2>
          {note ? <p className="mt-1 max-w-[64ch] text-caption">{note}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * A row of real, load-bearing numbers on a hairline rule. Never a grid of
 * shadowed tiles, and never a number that does not change what you do next.
 */
export function FactRow({
  facts,
  className,
}: {
  facts: Array<{ label: string; value: string; hint?: string }>;
  className?: string;
}) {
  return (
    <dl
      // Top rule only. The next section's rule closes this one, so the two
      // never stack into an empty band.
      className={cn(
        "grid grid-cols-2 gap-x-8 border-t border-rule sm:grid-cols-4",
        className,
      )}
    >
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0 py-3.5">
          <dt className="text-label">{fact.label}</dt>
          <dd className="tabular mt-1.5 font-mono text-[1.375rem] leading-none text-ink">
            {fact.value}
          </dd>
          {fact.hint ? <p className="mt-1.5 text-caption">{fact.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}

/** A paragraph that explains an empty or degraded region, in plain words. */
export function Note({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("max-w-[60ch] text-body text-ink-2", className)}>{children}</p>
  );
}

/**
 * A list of short machine facts, for example a customer stack. A hairline row
 * of mono text, not a scatter of capsules.
 */
export function FactList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item, i) => (
        <li key={item} className="flex items-center gap-3 font-mono text-[0.75rem] text-ink-2">
          {i > 0 && (
            <span aria-hidden className="text-ink-4">
              /
            </span>
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Full-bleed rows separated by hairlines. Used everywhere a list of records
 * appears, so a table never becomes a stack of cards.
 */
export function RowList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-rule border-t border-rule", className)}>
      {children}
    </ul>
  );
}
