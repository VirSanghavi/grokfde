"use client";

import { cn } from "@/lib/utils";
import type { ProspectMemory } from "@/types/ui";
import { useEffect, useState } from "react";

/**
 * What the engineer worked out about the person reading the page.
 *
 * This is the same memory the product carries between chat, voice, and email:
 * the stack it heard, what hurts, what it still has to resolve, and what it
 * intends to do next. It is extracted by the model from the conversation in the
 * console above, and it arrives on the same stream as the answer.
 *
 * It renders nothing invented. Before anyone has spoken there is no stack and
 * no pain point, so the surface says what it will hold instead of showing
 * placeholder rows, and each field appears only once it actually has content.
 */

const STAGE_LABEL: Record<string, string> = {
  discovery: "Discovery",
  "technical-evaluation": "Technical evaluation",
  "architecture-review": "Architecture review",
  procurement: "Procurement",
  "closed-won": "Closed won",
  "closed-lost": "Closed lost",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-b border-rule py-4 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)] sm:gap-8">
      <p className="text-[13px] text-ink-3">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * A list of short facts. Plain text on a hairline, never a scatter of chips.
 *
 * The separator is a pseudo element on a non-wrapping item, so a long stack can
 * never break between a name and its slash and leave one stranded at the start
 * of the next line.
 */
function Facts({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {items.map((item) => (
        <li
          key={item}
          className="whitespace-nowrap text-body text-ink after:pl-2 after:text-ink-4 after:content-['/'] last:after:content-none"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="max-w-[68ch] text-body text-ink">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function LiveMemory({ memory }: { memory: ProspectMemory | null }) {
  const [justUpdated, setJustUpdated] = useState(false);

  // A quiet, short-lived live marker. The point is to make it obvious the panel
  // changed because of something the visitor just did, not to keep throbbing.
  useEffect(() => {
    if (!memory) return;
    setJustUpdated(true);
    const id = window.setTimeout(() => setJustUpdated(false), 4000);
    return () => window.clearTimeout(id);
  }, [memory]);

  const stack = memory?.currentStack?.filter(Boolean) ?? [];
  const pains = memory?.painPoints?.filter(Boolean) ?? [];
  const requirements = memory?.requirements?.filter(Boolean) ?? [];
  const objections = memory?.objections?.filter(Boolean) ?? [];
  const unresolved = memory?.unresolvedQuestions?.filter(Boolean) ?? [];
  const hasAnything =
    Boolean(memory?.summary) ||
    stack.length > 0 ||
    pains.length > 0 ||
    requirements.length > 0 ||
    objections.length > 0 ||
    unresolved.length > 0 ||
    Boolean(memory?.nextAction);

  return (
    <div aria-live="polite">
      <div className="flex items-center gap-2.5">
        <h3 className="text-title text-ink">Working memory</h3>
        {justUpdated && (
          <>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-live" />
            <span className="text-[13px] text-ink-3">Updated</span>
          </>
        )}
      </div>

      {!hasAnything ? (
        <p className="mt-3 max-w-[64ch] text-body-l text-ink-3">
          Empty until a conversation gives it something. The engineer fills this
          in from what it hears, then carries it into the call and the follow-up
          so nobody repeats their stack twice.
        </p>
      ) : (
        <div
          className={cn(
            "mt-4 border-t border-rule",
            "motion-safe:animate-[fade-up_200ms_cubic-bezier(0.32,0.72,0,1)]",
          )}
        >
          {memory?.stage && (
            <Row label="Stage">
              <p className="text-body text-ink">
                {STAGE_LABEL[memory.stage] ?? memory.stage}
              </p>
            </Row>
          )}
          {stack.length > 0 && (
            <Row label="Stack">
              <Facts items={stack} />
            </Row>
          )}
          {pains.length > 0 && (
            <Row label="Pain points">
              <Lines items={pains} />
            </Row>
          )}
          {requirements.length > 0 && (
            <Row label="Requirements">
              <Lines items={requirements} />
            </Row>
          )}
          {objections.length > 0 && (
            <Row label="Objections">
              <Lines items={objections} />
            </Row>
          )}
          {unresolved.length > 0 && (
            <Row label="Still open">
              <Lines items={unresolved} />
            </Row>
          )}
          {memory?.nextAction && (
            <Row label="Next">
              <p className="max-w-[68ch] text-body text-ink">{memory.nextAction}</p>
            </Row>
          )}
          {memory?.summary && (
            <Row label="Summary">
              <p className="max-w-[68ch] text-body text-ink-2">{memory.summary}</p>
            </Row>
          )}
        </div>
      )}
    </div>
  );
}
