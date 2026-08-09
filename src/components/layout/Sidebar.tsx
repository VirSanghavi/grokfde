"use client";

import {
  IconActivity,
  IconAgent,
  IconChart,
  IconDashboard,
  IconDeploy,
  IconKnowledge,
  IconPanelRight,
  IconTerminal,
  LogoMark,
} from "@/components/icons";
import {
  useCompanyState,
  useWorkspace,
  type CompanyProfile,
} from "@/components/layout/WorkspaceContext";
import { cn } from "@/lib/utils";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Every entry here goes to a route that exists and to data that is real. There
 * is no link to a fixture id and no button that opens a panel of invented state.
 */
const NAV = [
  { href: "/dashboard", label: "Control room", icon: IconDashboard },
  { href: "/conversations", label: "Conversations", icon: IconActivity },
  { href: "/knowledge", label: "Knowledge", icon: IconKnowledge },
  { href: "/demos", label: "Demos", icon: IconDeploy },
  { href: "/field-signals", label: "Signals", icon: IconChart },
  { href: "/agent", label: "Agent", icon: IconAgent },
];

export function Sidebar({
  company,
  inDrawer = false,
}: {
  company: CompanyProfile | null;
  inDrawer?: boolean;
}) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, setCommandOpen } = useWorkspace();
  const { state, switchCompany } = useCompanyState();

  // Inside the drawer there is no room to collapse and no reason to.
  const collapsed = inDrawer ? false : sidebarCollapsed;
  const canSwitch = state.status === "ready" && state.options.length > 1;

  return (
    <aside
      className={cn(
        "transition-premium flex h-full min-h-0 shrink-0 flex-col border-r border-rule bg-surface",
        inDrawer ? "w-full border-r-0" : collapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-w)]",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b border-rule px-3 py-4",
          collapsed && "justify-center px-2",
        )}
      >
        <LogoMark size={32} variant="brand" className="shrink-0 rounded-[var(--radius-sm)]" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-body font-medium text-ink">
              {company ? company.name : "Grok FDE"}
            </p>
            <p className="mono-ts truncate">
              {company
                ? `${company.agentName} · ${company.slug}`
                : state.status === "choosing"
                  ? "No workspace chosen"
                  : state.status === "error"
                    ? "Not loaded"
                    : state.status === "none"
                      ? "No company yet"
                      : "Loading"}
            </p>
          </div>
        )}
      </div>

      <div className={cn("px-2 pt-3", collapsed && "px-1.5")}>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          title="Open the command menu"
          className={cn(
            "transition-premium flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-sm)] border border-rule bg-paper px-2.5 text-left hover:border-rule-strong hover:bg-hover",
            collapsed && "justify-center px-0",
          )}
        >
          <IconTerminal size={16} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-caption">Jump to</span>
              <kbd className="mono-ts rounded-[var(--radius-xs)] border border-rule px-1">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      <nav
        aria-label="Workspace"
        className={cn(
          "scrollbar-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3",
          collapsed && "px-1.5",
        )}
      >
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "transition-premium flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-2.5 text-body font-medium",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sunken text-ink"
                  : "text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              <Icon size={18} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={cn("border-t border-rule p-3", collapsed && "px-1.5")}>
        {!collapsed && company && (
          <>
            <p className="text-label">Prospect link</p>
            <Link
              href={`/fde/${company.slug}`}
              className="transition-premium mt-1.5 flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-rule px-2.5 text-caption hover:border-rule-strong hover:bg-hover"
            >
              <span className="truncate font-mono text-[0.75rem] text-ink-2">
                /fde/{company.slug}
              </span>
              <span aria-hidden className="mono-ts shrink-0">
                Open
              </span>
            </Link>
          </>
        )}

        {!collapsed && canSwitch && (
          <button
            type="button"
            onClick={switchCompany}
            className="transition-premium mt-2 flex min-h-11 w-full items-center rounded-[var(--radius-sm)] px-2.5 text-left text-caption text-ink-3 hover:bg-hover hover:text-ink"
          >
            Switch workspace
          </button>
        )}

        {!inDrawer && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
            title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
            className={cn(
              "transition-premium mt-2 flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-caption text-ink-3 hover:bg-hover hover:text-ink",
              collapsed ? "w-full justify-center px-0" : "w-full",
            )}
          >
            <IconPanelRight size={16} />
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
