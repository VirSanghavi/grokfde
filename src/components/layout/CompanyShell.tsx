"use client";

import { CommandPalette } from "@/components/layout/CommandPalette";
import { ContextDrawer } from "@/components/layout/ContextDrawer";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/layout/WorkspaceContext";
import { IconStatusDot } from "@/components/icons/DottedIcon";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Menu, PanelRight, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

function ShellInner({ children }: { children: ReactNode }) {
  const [agentName, setAgentName] = useState("Atlas");
  const [companyName, setCompanyName] = useState("Grok FDE");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { openDrawer, drawerOpen, closeDrawer, setCommandOpen } = useWorkspace();

  useEffect(() => {
    api
      .getCompany()
      .then((c) => {
        setAgentName(c.agentName);
        setCompanyName(c.name);
      })
      .catch(() => {
        /* unauthenticated / no company yet */
      });
  }, []);

  return (
    <div className="app-viewport flex bg-bg">
      <div className="hidden h-full md:flex">
        <Sidebar agentName={agentName} companyName={companyName} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            className="absolute inset-0 bg-fg/25 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full shadow-lg animate-in">
            <Sidebar agentName={agentName} companyName={companyName} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg-elevated px-3 md:px-4">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-border text-fg-muted transition-premium hover:bg-bg-hover md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <div className="hidden items-center gap-2 md:flex">
            <IconStatusDot tone="success" />
            <span className="text-xs font-medium text-fg">{agentName}</span>
            <span className="mono-ts">operational</span>
          </div>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="ml-auto flex h-8 max-w-[220px] flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-bg px-2.5 text-left transition-premium hover:border-border-strong sm:max-w-xs"
          >
            <span className="truncate text-xs text-fg-muted">Search workspace…</span>
            <kbd className="mono-ts ml-auto rounded border border-border bg-bg-elevated px-1">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() =>
              drawerOpen
                ? closeDrawer()
                : openDrawer({
                    title: "MCP State Inspector",
                    subtitle: "Context window · tool inventory",
                    kind: "mcp",
                  })
            }
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-border text-fg-muted transition-premium hover:bg-bg-hover hover:text-fg",
              drawerOpen && "border-brand-border bg-brand-dim text-brand-strong",
            )}
            aria-label="Toggle inspector"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </main>
          <div className="hidden h-full lg:flex">
            <ContextDrawer />
          </div>
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end lg:hidden">
          <button
            className="absolute inset-0 bg-fg/25 backdrop-blur-sm"
            aria-label="Close drawer"
            onClick={closeDrawer}
          />
          <div className="relative h-full w-[min(100vw,400px)] shadow-lg">
            <ContextDrawer />
          </div>
        </div>
      )}

      <CommandPalette />
    </div>
  );
}

export function CompanyShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <ShellInner>{children}</ShellInner>
    </WorkspaceProvider>
  );
}
