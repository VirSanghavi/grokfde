import { normalizeDashes } from "@/components/prospect/MessageBubble";
import type { ProspectMemory } from "@/types/ui";

/**
 * What Atlas has actually learned, and nothing else.
 *
 * The rule that shapes this whole component: an empty memory renders as
 * NOTHING. Not a heading, not a grid of labels waiting to be filled, and
 * certainly not a column of em dashes. A visitor who has said nothing yet is
 * told nothing, because there is nothing true to say. Every field below is
 * rendered only when it has real content, so the panel grows as the
 * conversation does. That growth is the proof this is not a chatbot, and it
 * only reads as proof if the starting point is genuinely empty.
 */

function hasItems(value: string[] | undefined): value is string[] {
  return Array.isArray(value) && value.some((v) => v && v.trim().length > 0);
}

/**
 * Whether this panel would render anything at all.
 *
 * The page needs to know BEFORE laying out, because a rail that renders null
 * still leaves a bordered empty column sitting there. `stage` is deliberately
 * ignored: every prospect has one from the moment they are created, so
 * counting it would make the panel always look non-empty and put a lone
 * "Stage: new" on screen, which is the empty-scaffold problem in miniature.
 */
export function hasMemoryContent(memory: ProspectMemory): boolean {
  return Boolean(
    memory.summary?.trim() ||
      memory.nextAction?.trim() ||
      hasItems(memory.currentStack) ||
      hasItems(memory.requirements) ||
      hasItems(memory.painPoints) ||
      hasItems(memory.objections) ||
      hasItems(memory.unresolvedQuestions),
  );
}

function clean(items: string[]): string[] {
  return items.map((i) => i.trim()).filter(Boolean);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {clean(items).map((item) => (
        <li key={item} className="text-[0.9375rem] leading-[1.5] text-ink-2">
          {normalizeDashes(item)}
        </li>
      ))}
    </ul>
  );
}

export function MemoryPanel({
  memory,
  agentName,
  className,
}: {
  memory: ProspectMemory;
  agentName: string;
  className?: string;
}) {
  const summary = memory.summary?.trim();
  const nextAction = memory.nextAction?.trim();

  const fields = [
    hasItems(memory.currentStack) && (
      <Field key="stack" label="Stack">
        <Lines items={memory.currentStack} />
      </Field>
    ),
    hasItems(memory.requirements) && (
      <Field key="req" label="Requirements">
        <Lines items={memory.requirements} />
      </Field>
    ),
    hasItems(memory.painPoints) && (
      <Field key="pain" label="Pain points">
        <Lines items={memory.painPoints} />
      </Field>
    ),
    hasItems(memory.objections) && (
      <Field key="obj" label="Objections">
        <Lines items={memory.objections} />
      </Field>
    ),
    hasItems(memory.unresolvedQuestions) && (
      <Field key="open" label="Open questions">
        <Lines items={memory.unresolvedQuestions} />
      </Field>
    ),
    nextAction && (
      <Field key="next" label="Next step">
        <p className="text-[0.9375rem] leading-[1.5] text-ink-2">
          {normalizeDashes(nextAction)}
        </p>
      </Field>
    ),
  ].filter(Boolean);

  // Nothing learned yet. Render nothing at all, not an empty scaffold.
  if (!summary && fields.length === 0) return null;

  return (
    <section className={className} aria-labelledby="memory-heading">
      <h2
        id="memory-heading"
        className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3"
      >
        What {agentName} knows
      </h2>

      {summary && (
        <p className="mt-3 max-w-[68ch] text-[0.9375rem] leading-[1.55] text-ink-2">
          {normalizeDashes(summary)}
        </p>
      )}

      {fields.length > 0 && (
        <div className="mt-6 space-y-6 border-t border-rule pt-6">{fields}</div>
      )}
    </section>
  );
}
