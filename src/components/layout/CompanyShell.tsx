"use client";

import { CommandPalette } from "@/components/layout/CommandPalette";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  WorkspaceProvider,
  useCompanyState,
  useWorkspace,
  type CompanyOption,
} from "@/components/layout/WorkspaceContext";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { IconMenu, IconSearch, IconX } from "@/components/icons";
import { cn } from "@/lib/utils";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const FRAME = "w-full px-5 sm:px-8 lg:px-12";

/* ── Mobile navigation drawer ────────────────────────────────────────────── */

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function NavDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;

    // The drawer covers the app, so nothing behind it may scroll or be tabbed to.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-ink/25"
        aria-label="Close navigation"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="animate-drawer relative z-10 flex h-full w-[min(88vw,17.5rem)] flex-col bg-surface shadow-[var(--elevation-2)]"
      >
        {children}
      </div>
    </div>
  );
}

/* ── Workspace picker: never guess which company this person runs ────────── */

function WorkspacePicker({
  options,
  onSelect,
}: {
  options: CompanyOption[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[46rem] px-5 py-16 sm:px-8">
      <h1 className="text-display-m text-ink">Which workspace are you opening?</h1>
      <p className="mt-3 max-w-[60ch] text-body-l text-ink-2">
        This browser has more than one company on it. Pick the one you want and every
        screen from here on belongs to it. You can switch again from the sidebar.
      </p>

      <ul className="mt-8 divide-y divide-rule border-y border-rule">
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onSelect(option.id)}
              className="transition-premium flex w-full items-center justify-between gap-4 py-4 text-left hover:bg-hover active:scale-[0.997]"
            >
              <span className="min-w-0">
                <span className="block text-body font-medium text-ink">{option.name}</span>
                <span className="mono-ts mt-0.5 block truncate">
                  {option.slug} · agent {option.agentName}
                </span>
              </span>
              <span aria-hidden className="mono-ts shrink-0">
                Open &rarr;
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Shell ───────────────────────────────────────────────────────────────── */

function ShellInner({ children }: { children: ReactNode }) {
  const { state, select, retry } = useCompanyState();
  const { setCommandOpen } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const closeDrawer = useCallback(() => setMobileOpen(false), []);

  // A drawer that survives navigation would cover the page you just opened.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const company = state.status === "ready" ? state.company : null;

  let body: ReactNode;
  if (state.status === "loading") {
    body = (
      <div className={cn(FRAME, "py-10")} aria-busy="true" role="status">
        <span className="sr-only">Loading your workspace</span>
        <div className="skeleton h-2.5 w-24" aria-hidden />
        <div className="skeleton mt-3 h-10 w-52" aria-hidden />
        <div className="skeleton mt-4 h-3.5 w-full max-w-[46ch]" aria-hidden />
      </div>
    );
  } else if (state.status === "error") {
    body = (
      <ErrorState
        title="We could not load your workspace."
        message={state.message}
        onRetry={retry}
      />
    );
  } else if (state.status === "none") {
    body = (
      <div className="mx-auto w-full max-w-[46rem] px-5 py-16 sm:px-8">
        <h1 className="text-display-m text-ink">There is no company here yet.</h1>
        <p className="mt-3 max-w-[60ch] text-body-l text-ink-2">
          A company is what an agent belongs to: its name, its knowledge, and the link it
          answers on. Create one and this becomes its control room.
        </p>
        <div className="mt-6">
          <Link href="/onboarding">
            <Button>Set up your company</Button>
          </Link>
        </div>
      </div>
    );
  } else if (state.status === "choosing") {
    body = <WorkspacePicker options={state.options} onSelect={select} />;
  } else {
    body = children;
  }

  return (
    <div className="app-viewport flex bg-paper">
      <div className="hidden h-full md:flex">
        <Sidebar company={company} />
      </div>

      <NavDrawer open={mobileOpen} onClose={closeDrawer}>
        <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
          <span className="text-label">Navigation</span>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close navigation"
            className="transition-premium flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-ink-3 hover:bg-hover hover:text-ink"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <Sidebar company={company} inDrawer />
      </NavDrawer>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone chrome only. On a laptop each page owns its own header. */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-rule bg-surface px-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            className="transition-premium flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-ink-2 hover:bg-hover hover:text-ink"
          >
            <IconMenu className="h-5 w-5" />
          </button>

          <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
            {company ? company.name : "Grok FDE"}
          </span>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            aria-label="Search and commands"
            className="transition-premium flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-ink-2 hover:bg-hover hover:text-ink"
          >
            <IconSearch className="h-5 w-5" />
          </button>
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{body}</main>
      </div>

      <CommandPalette company={company} />
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
