"use client";

import {
  IconAccounts,
  IconActivity,
  IconAgent,
  IconChart,
  IconDashboard,
  IconDeploy,
  IconKnowledge,
  IconMcp,
  IconSearch,
  IconSettings,
  IconTerminal,
} from "@/components/icons";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
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

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  action: () => void;
};

export function CommandPalette() {
  const { commandOpen, setCommandOpen, openDrawer, toggleSidebar } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<CommandItem[]>(() => {
    const nav: CommandItem[] = [
      {
        id: "dash",
        label: "Open Operations Center",
        hint: "Dashboard",
        group: "Navigate",
        icon: IconDashboard,
        action: () => router.push("/dashboard"),
      },
      {
        id: "knowledge",
        label: "Knowledge ingestion",
        hint: "Sources & vectors",
        group: "Navigate",
        icon: IconKnowledge,
        action: () => router.push("/knowledge"),
      },
      {
        id: "activity",
        label: "Conversations",
        hint: "Multimodal stream",
        group: "Navigate",
        icon: IconActivity,
        action: () => router.push("/conversations"),
      },
      {
        id: "accounts",
        label: "Account room",
        hint: "Globex",
        group: "Navigate",
        icon: IconAccounts,
        action: () => router.push("/accounts/pr_globex"),
      },
      {
        id: "agent",
        label: "Agent identity",
        group: "Navigate",
        icon: IconAgent,
        action: () => router.push("/agent"),
      },
      {
        id: "signals",
        label: "Field signals",
        group: "Navigate",
        icon: IconChart,
        action: () => router.push("/field-signals"),
      },
      {
        id: "fde",
        label: "Open prospect FDE",
        hint: "Talk as prospect",
        group: "Navigate",
        icon: IconTerminal,
        action: () => router.push("/fde/grok-fde"),
      },
    ];

    const actions: CommandItem[] = [
      {
        id: "toggle-sidebar",
        label: "Toggle sidebar density",
        group: "Workspace",
        icon: IconSettings,
        action: () => toggleSidebar(),
      },
      {
        id: "inspect-mcp",
        label: "Inspect MCP inventory",
        group: "Workspace",
        icon: IconMcp,
        action: () =>
          openDrawer({
            title: "MCP State Inspector",
            subtitle: "Connected tool surface",
            kind: "mcp",
          }),
      },
      {
        id: "deploy",
        label: "Open implementation workspace",
        group: "Workspace",
        icon: IconDeploy,
        action: () => router.push("/conversations"),
      },
    ];

    const all = [...nav, ...actions];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.hint?.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q),
    );
  }, [query, router, openDrawer, toggleSidebar]);

  useEffect(() => {
    setActive(0);
  }, [query, commandOpen]);

  useEffect(() => {
    if (commandOpen) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [commandOpen]);

  const run = useCallback(
    (item: CommandItem) => {
      setCommandOpen(false);
      item.action();
    },
    [setCommandOpen],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
        return;
      }
      if (!commandOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setCommandOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && items[active]) {
        e.preventDefault();
        run(items[active]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen, items, active, run]);

  if (!commandOpen) return null;

  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-fg/20 backdrop-blur-sm transition-premium"
        aria-label="Close command palette"
        onClick={() => setCommandOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-[var(--radius-xl)] border border-border bg-bg-elevated shadow-lg animate-in"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <IconSearch className="opacity-80" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Switch target, open tools, jump to workspace…"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-faint"
          />
          <kbd className="mono-ts rounded-md border border-border bg-bg px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[min(420px,50vh)] overflow-y-auto scrollbar-thin py-2">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">No matching commands</p>
          )}
          {groups.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (!groupItems.length) return null;
            return (
              <div key={group} className="mb-1">
                <p className="mono-ts px-4 py-1.5 uppercase tracking-[0.12em]">{group}</p>
                {groupItems.map((item) => {
                  const idx = items.indexOf(item);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => run(item)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-premium",
                        idx === active ? "bg-brand-dim" : "hover:bg-bg-hover",
                      )}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-fg">{item.label}</span>
                        {item.hint && (
                          <span className="block truncate text-xs text-fg-muted">{item.hint}</span>
                        )}
                      </span>
                      {idx === active && (
                        <span className="mono-ts text-brand-strong">↵</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-bg-muted px-4 py-2">
          <span className="mono-ts">⌘K toggle</span>
          <span className="mono-ts">↑↓ navigate · ↵ run</span>
        </div>
      </div>
    </div>
  );
}
