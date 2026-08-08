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
  IconSettings,
  IconStatusDot,
  IconTerminal,
  LogoMark,
} from "@/components/icons";
import { useWorkspace } from "@/components/layout/WorkspaceContext";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Operations", icon: IconDashboard },
  { href: "/demos", label: "Demos", icon: IconDeploy },
  { href: "/knowledge", label: "Knowledge", icon: IconKnowledge },
  { href: "/conversations", label: "Activity", icon: IconActivity },
  { href: "/accounts/pr_globex", label: "Accounts", icon: IconAccounts },
  { href: "/deployments", label: "Deployments", icon: IconDeploy },
  { href: "/field-signals", label: "Signals", icon: IconChart },
  { href: "/agent", label: "Agent", icon: IconAgent },
];

export function Sidebar({
  agentName = "Atlas",
  companyName = "Grok FDE",
}: {
  agentName?: string;
  companyName?: string;
}) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, openDrawer, setCommandOpen } = useWorkspace();

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-bg-elevated transition-premium",
        sidebarCollapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-w)]",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b border-border px-3 py-4",
          sidebarCollapsed && "justify-center px-2",
        )}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-premium hover:opacity-90"
          aria-label="Toggle sidebar"
        >
          <LogoMark size={36} variant="brand" className="rounded-[var(--radius-md)]" />
        </button>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-fg">{companyName}</p>
            <p className="mono-ts truncate uppercase tracking-[0.14em]">Grok FDE</p>
          </div>
        )}
      </div>

      <div className={cn("px-2 pt-3", sidebarCollapsed && "px-1.5")}>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className={cn(
            "flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-border bg-bg px-2.5 py-2 text-left transition-premium hover:border-border-strong hover:bg-bg-hover",
            sidebarCollapsed && "justify-center px-0",
          )}
        >
          <IconTerminal size={16} />
          {!sidebarCollapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">Command…</span>
              <kbd className="mono-ts rounded border border-border bg-bg-elevated px-1">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      <nav className={cn("flex flex-1 flex-col gap-0.5 px-2 py-3", sidebarCollapsed && "px-1.5")}>
        {nav.map((item) => {
          const active = item.href.startsWith("/accounts")
            ? pathname?.startsWith("/accounts")
            : pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2.5 text-sm font-medium transition-premium",
                sidebarCollapsed && "justify-center px-0",
                active
                  ? "bg-brand-dim text-fg ring-1 ring-brand-border"
                  : "text-fg-muted hover:bg-bg-hover hover:text-fg",
              )}
            >
              <Icon size={18} />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}

        <button
          type="button"
          title="MCP Inspector"
          onClick={() =>
            openDrawer({
              title: "MCP State Inspector",
              subtitle: "Live tool inventory · context composition",
              kind: "mcp",
            })
          }
          className={cn(
            "mt-1 flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2.5 text-left text-sm font-medium text-fg-muted transition-premium hover:bg-bg-hover hover:text-fg",
            sidebarCollapsed && "justify-center px-0",
          )}
        >
          <IconMcp size={18} />
          {!sidebarCollapsed && <span>MCP tools</span>}
        </button>
      </nav>

      <div className={cn("border-t border-border p-3", sidebarCollapsed && "p-2")}>
        <div
          className={cn(
            "rounded-[var(--radius-lg)] border border-border bg-bg p-3",
            sidebarCollapsed && "flex justify-center p-2",
          )}
        >
          {sidebarCollapsed ? (
            <IconStatusDot tone="success" />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <IconStatusDot tone="success" />
                <span className="text-sm font-medium text-fg">{agentName}</span>
              </div>
              <p className="mono-ts mt-1">Online · voice ready</p>
              <Link
                href="/fde/grok-fde"
                className="mt-2.5 flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-fg-secondary transition-premium hover:bg-bg-hover"
              >
                Prospect link
                <IconSettings size={14} />
              </Link>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
