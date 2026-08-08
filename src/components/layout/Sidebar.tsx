"use client";

import { cn } from "@/lib/utils";
import {
  BookOpen,
  LayoutDashboard,
  MessageSquare,
  Bot,
  ExternalLink,
  Building2,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts/pr_globex", label: "Accounts", icon: Building2 },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/field-signals", label: "Field Signals", icon: Lightbulb },
  { href: "/agent", label: "Agent", icon: Bot },
];

export function Sidebar({
  agentName = "Atlas",
  companyName = "Grok FDE",
}: {
  agentName?: string;
  companyName?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-bg-elevated">
      <div className="px-5 pb-4 pt-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-brand font-mono text-[10px] font-semibold tracking-wide text-brand-fg">
            FDE
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">{companyName}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
              Grok FDE
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {nav.map((item) => {
          const active =
            item.href.startsWith("/accounts")
              ? pathname?.startsWith("/accounts")
              : pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-dim text-fg shadow-sm ring-1 ring-brand-border"
                  : "text-fg-muted hover:bg-bg-hover hover:text-fg"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand-strong" : "text-fg-faint")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4">
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg p-3.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-sm font-medium text-fg">{agentName}</span>
          </div>
          <p className="mt-1 text-xs text-fg-muted">Online · ready for prospects</p>
          <Link
            href="/fde/grok-fde"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand transition-colors hover:text-fg"
          >
            Open prospect link
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
