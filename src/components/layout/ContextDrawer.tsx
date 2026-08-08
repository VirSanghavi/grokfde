"use client";

import { IconStatusDot } from "@/components/icons/DottedIcon";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
import { McpInspectorPanel } from "@/components/ops/McpInspectorPanel";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function ContextDrawer() {
  const { drawerOpen, drawer, closeDrawer } = useWorkspace();

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-l border-border bg-bg-elevated transition-premium",
        drawerOpen ? "w-[min(100vw,var(--drawer-w))] opacity-100" : "w-0 overflow-hidden border-l-0 opacity-0",
      )}
      aria-hidden={!drawerOpen}
    >
      {drawerOpen && drawer && (
        <div className="flex h-full w-[var(--drawer-w)] max-w-[100vw] flex-col animate-drawer">
          <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
            <div className="min-w-0">
              <p className="mono-ts uppercase tracking-[0.14em]">Inspector</p>
              <h2 className="mt-1 truncate text-sm font-semibold tracking-tight text-fg">
                {drawer.title}
              </h2>
              {drawer.subtitle && (
                <p className="mt-0.5 truncate text-xs text-fg-muted">{drawer.subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-border text-fg-muted transition-premium hover:bg-bg-hover hover:text-fg"
              aria-label="Close inspector"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
            {drawer.kind === "mcp" || drawer.title.toLowerCase().includes("mcp") ? (
              <McpInspectorPanel />
            ) : drawer.body ? (
              drawer.body
            ) : (
              <DefaultInspect drawer={drawer} />
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function DefaultInspect({
  drawer,
}: {
  drawer: { title: string; subtitle?: string; meta?: Record<string, unknown> };
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-border bg-bg p-3">
        <div className="flex items-center gap-2">
          <IconStatusDot tone="info" />
          <span className="text-xs font-medium text-fg">Live context</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          {drawer.subtitle ||
            "Detail surfaces open here instead of modal dialogs — keep the timeline anchored while you inspect state."}
        </p>
      </div>
      {drawer.meta && (
        <pre className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-bg p-3 font-mono text-[11px] leading-relaxed text-fg-secondary">
          {JSON.stringify(drawer.meta, null, 2)}
        </pre>
      )}
    </div>
  );
}
