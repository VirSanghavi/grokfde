import { Badge } from "@/components/ui/Badge";
import type { ProspectMemory } from "@/types/ui";

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">{label}</p>
      {children}
    </div>
  );
}

function ChipList({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (!items.length) {
    return <p className="text-sm text-fg-faint">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg-secondary"
        >
          {item}
        </span>
      ))}
    </div>
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
    <aside
      className={`flex h-full flex-col gap-5 overflow-y-auto p-5 scrollbar-thin ${className ?? ""}`}
    >
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">Prospect</p>
        <h3 className="mt-1 text-lg font-semibold text-fg">{name}</h3>
        {memory.summary && (
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{memory.summary}</p>
        )}
      </div>

      <Section label="Stage">
        <Badge tone="accent">{String(memory.stage).replace(/-/g, " ")}</Badge>
      </Section>

      <Section label="Stack">
        <ChipList items={memory.currentStack} empty="No stack recorded yet" />
      </Section>

      <Section label="Pain points">
        <ChipList items={memory.painPoints} />
      </Section>

      <Section label="Requirements">
        <ChipList items={memory.requirements} />
      </Section>

      <Section label="Objections">
        <ChipList items={memory.objections} />
      </Section>

      <Section label="Next step">
        <p className="text-sm text-fg-secondary">{memory.nextAction || "—"}</p>
      </Section>
    </aside>
  );
}
