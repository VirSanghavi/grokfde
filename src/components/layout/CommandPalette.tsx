"use client";

import {
  IconActivity,
  IconAgent,
  IconChart,
  IconDashboard,
  IconDeploy,
  IconKnowledge,
  IconSearch,
  IconSettings,
  IconTerminal,
} from "@/components/icons";
import {
  useCompanyState,
  useWorkspace,
  type CompanyProfile,
} from "@/components/layout/WorkspaceContext";
import { cn } from "@/lib/utils";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  run: () => void;
}

/**
 * Every command here does something. Nothing opens a panel of state we do not
 * have, and nothing navigates to an id that only exists in a fixture.
 */
export function CommandPalette({ company }: { company: CompanyProfile | null }) {
  const { commandOpen, setCommandOpen, toggleSidebar, sidebarCollapsed } = useWorkspace();
  const { state, switchCompany } = useCompanyState();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const items = useMemo<CommandItem[]>(() => {
    const go = (href: string) => () => router.push(href);

    const all: CommandItem[] = [
      {
        id: "dashboard",
        label: "Control room",
        hint: company ? `What ${company.agentName} is doing` : undefined,
        group: "Go to",
        icon: IconDashboard,
        run: go("/dashboard"),
      },
      {
        id: "conversations",
        label: "Conversations",
        hint: "Every thread, one per prospect",
        group: "Go to",
        icon: IconActivity,
        run: go("/conversations"),
      },
      {
        id: "knowledge",
        label: "Knowledge",
        hint: company ? `What ${company.agentName} can answer from` : undefined,
        group: "Go to",
        icon: IconKnowledge,
        run: go("/knowledge"),
      },
      {
        id: "demos",
        label: "Demos",
        hint: "Booked calls",
        group: "Go to",
        icon: IconDeploy,
        run: go("/demos"),
      },
      {
        id: "signals",
        label: "Signals",
        hint: "What keeps coming up",
        group: "Go to",
        icon: IconChart,
        run: go("/field-signals"),
      },
      {
        id: "agent",
        label: "Agent",
        hint: company ? `${company.agentName}'s identity and tools` : undefined,
        group: "Go to",
        icon: IconAgent,
        run: go("/agent"),
      },
    ];

    if (company) {
      all.push(
        {
          id: "prospect-link",
          label: `Open the prospect link`,
          hint: `/fde/${company.slug}`,
          group: "Open",
          icon: IconTerminal,
          run: go(`/fde/${company.slug}`),
        },
        {
          id: "booking-link",
          label: "Open the booking page",
          hint: `/book/${company.slug}`,
          group: "Open",
          icon: IconDeploy,
          run: go(`/book/${company.slug}`),
        },
      );
    }

    all.push({
      id: "toggle-sidebar",
      label: sidebarCollapsed ? "Expand the sidebar" : "Collapse the sidebar",
      group: "Workspace",
      icon: IconSettings,
      run: toggleSidebar,
    });

    if (state.status === "ready" && state.options.length > 1) {
      all.push({
        id: "switch-workspace",
        label: "Switch workspace",
        hint: `${state.options.length} companies on this browser`,
        group: "Workspace",
        icon: IconSettings,
        run: switchCompany,
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.hint?.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q),
    );
  }, [company, query, router, sidebarCollapsed, state, switchCompany, toggleSidebar]);

  useEffect(() => {
    setActive(0);
  }, [query, commandOpen]);

  const run = useCallback(
    (item: CommandItem) => {
      setCommandOpen(false);
      item.run();
    },
    [setCommandOpen],
  );

  // ⌘K toggles from anywhere, including when the palette is not mounted.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(!commandOpen);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  // Focus enters the dialog on open and returns to the trigger on close.
  useEffect(() => {
    if (!commandOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      returnFocusRef.current?.focus?.();
    };
  }, [commandOpen]);

  if (!commandOpen) return null;

  const groups = [...new Set(items.map((i) => i.group))];

  function onDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setCommandOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length));
    } else if (event.key === "Enter" && items[active]) {
      event.preventDefault();
      run(items[active]!);
    } else if (event.key === "Tab") {
      // The palette is a single control. Keep focus inside it.
      event.preventDefault();
      inputRef.current?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[10vh]">
      <button
        type="button"
        className="absolute inset-0 bg-ink/20"
        aria-label="Close the command menu"
        onClick={() => setCommandOpen(false)}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        onKeyDown={onDialogKeyDown}
        className="surface-floating animate-in relative z-10 flex max-h-[80dvh] w-full max-w-xl flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-rule px-4 py-3">
          <IconSearch className="text-ink-3" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a screen or open a link"
            aria-label="Search commands"
            className="min-w-0 flex-1 bg-transparent text-body-l text-ink outline-none placeholder:text-ink-4"
          />
          <kbd className="mono-ts rounded-[var(--radius-xs)] border border-rule px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-2">
          {items.length === 0 && (
            <p className="px-4 py-10 text-center text-body text-ink-2">
              Nothing matches &ldquo;{query.trim()}&rdquo;.
            </p>
          )}
          {groups.map((group) => (
            <div key={group} className="mb-1">
              <p className="text-label px-4 py-1.5">{group}</p>
              {items
                .filter((i) => i.group === group)
                .map((item) => {
                  const index = items.indexOf(item);
                  const Icon = item.icon;
                  const isActive = index === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => run(item)}
                      className={cn(
                        "transition-premium flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left",
                        isActive ? "bg-sunken" : "hover:bg-hover",
                      )}
                    >
                      <Icon size={16} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body text-ink">{item.label}</span>
                        {item.hint && (
                          <span className="mono-ts block truncate">{item.hint}</span>
                        )}
                      </span>
                      {isActive && (
                        <span aria-hidden className="mono-ts">
                          ↵
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-rule bg-sunken px-4 py-2">
          <span className="mono-ts">⌘K opens and closes</span>
          <span className="mono-ts">↑↓ move · ↵ run</span>
        </div>
      </div>
    </div>
  );
}
