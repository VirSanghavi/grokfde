import { cn, humanize } from "@/lib/utils";
import type { ProspectMemory } from "@/types/ui";

/**
 * What the agent remembers about one prospect, carried across chat, calls,
 * email, and Slack. Every field here is written by the extraction pass, so an
 * empty field says it is empty rather than showing a dash.
 */

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-rule py-4">
      <p className="text-label">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Lines({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-caption">{empty}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="text-body text-ink-2">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ProspectMemoryPanel({
  name,
  memory,
  className,
}: {
  name: string;
  memory: ProspectMemory;
  className?: string;
}) {
  return (
    <aside className={cn("scrollbar-thin h-full overflow-y-auto px-5 py-5", className)}>
      <p className="text-label">What we know</p>
      <h3 className="mt-1.5 text-title text-ink">{name}</h3>
      {memory.summary ? (
        <p className="mt-2 max-w-[46ch] text-body text-ink-2">{memory.summary}</p>
      ) : (
        <p className="mt-2 max-w-[46ch] text-caption">
          Nothing summarised yet. This fills in from the first real exchange.
        </p>
      )}

      <div className="mt-5">
        <Group label="Stage">
          <p className="text-body text-ink">{humanize(String(memory.stage))}</p>
        </Group>

        <Group label="Their stack">
          <Lines items={memory.currentStack} empty="No stack mentioned yet." />
        </Group>

        <Group label="Pain points">
          <Lines items={memory.painPoints} empty="None recorded." />
        </Group>

        <Group label="Requirements">
          <Lines items={memory.requirements} empty="None recorded." />
        </Group>

        <Group label="Objections">
          <Lines items={memory.objections} empty="None raised so far." />
        </Group>

        <Group label="Next step">
          {memory.nextAction ? (
            <p className="max-w-[46ch] text-body text-ink-2">{memory.nextAction}</p>
          ) : (
            <p className="text-caption">Not decided yet.</p>
          )}
        </Group>
      </div>
    </aside>
  );
}
