"use client";

import { IconMenu, IconX } from "@/components/icons";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The hero drops a 1px marker at its own bottom edge so the nav knows whether it
 * is floating over film or over the page.
 */
export const FILM_SENTINEL_ID = "marketing-film-end";

/**
 * Both destinations work for a stranger with no account. Nothing gated is ever
 * promoted to nav level.
 */
const LINKS = [
  { href: "#what-it-does", label: "What it does" },
  { href: "/fde/grok-fde", label: "Talk to the engineer" },
];

export function MarketingNav() {
  // The only route using this nav opens on the hero film, so the server render
  // is already correct. Without a sentinel the effect drops it to page chrome.
  const [onFilm, setOnFilm] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    const sentinel = document.getElementById(FILM_SENTINEL_ID);
    if (!sentinel) {
      setOnFilm(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setOnFilm(entry.isIntersecting),
      { rootMargin: "-88px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Scroll lock on both elements: globals.css hands the document scroller to
  // html on marketing routes. Inline styles outrank that stylesheet rule.
  useEffect(() => {
    if (!menuOpen) return;
    const html = document.documentElement;
    const { body } = document;
    const previous = {
      html: html.style.overflow,
      body: body.style.overflow,
      padding: body.style.paddingRight,
    };
    const gutter = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;
    return () => {
      html.style.overflow = previous.html;
      body.style.overflow = previous.body;
      body.style.paddingRight = previous.padding;
    };
  }, [menuOpen]);

  // Focus enters the panel, stays in it, and returns to the trigger.
  useEffect(() => {
    if (!menuOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      );

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const outside = !active || !panel.contains(active);
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, close]);

  // An open phone menu must not survive a rotation onto the desktop layout.
  useEffect(() => {
    if (!menuOpen) return;
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (query.matches) close();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [menuOpen, close]);

  /**
   * No display utility in here. `cn` is a plain join with no tailwind-merge, so
   * an `inline-flex` baked into a shared string beats a later `hidden` and the
   * element never hides. Each caller sets its own display.
   */
  const quietLink = cn(
    "h-11 items-center whitespace-nowrap rounded-[var(--radius-control)] px-3 text-[15px] font-medium",
    "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]",
    onFilm ? "text-white/78 hover:text-white" : "text-ink-2 hover:text-ink",
  );

  return (
    <>
      {/*
        A floating bar, inset from every edge. It always carries its own ground,
        which is what stops nav text from colliding with page content once the
        film has scrolled away. Over film it is translucent dark with a blur,
        the one place the contract allows backdrop blur, because it genuinely
        floats over imagery. Over the page it becomes paper with a hairline.
      */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <nav
          aria-label="Primary"
          className={cn(
            "pointer-events-auto flex h-16 w-full items-center gap-2 rounded-[var(--radius-hero)] border px-3 sm:px-4",
            "transition-[background-color,border-color,box-shadow] duration-[var(--duration-surface)] ease-[var(--ease-out)]",
            onFilm
              ? "border-white/14 bg-stage/55 text-white shadow-[var(--elevation-2)] backdrop-blur-xl backdrop-saturate-150"
              : "border-rule bg-paper text-ink shadow-[var(--elevation-1)]",
          )}
        >
          <Link
            href="/"
            className={cn(
              "mr-auto inline-flex h-11 items-center whitespace-nowrap rounded-[var(--radius-control)] px-2 text-[17px] font-semibold tracking-[-0.02em]",
              "transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:opacity-80",
            )}
          >
            Grok FDE
          </Link>

          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(quietLink, "inline-flex")}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/*
            Quiet text link, and gated, so it never takes a button. Held back
            below md: at phone width it lives in the menu, and squeezing it into
            the bar wrapped every label onto two lines.
          */}
          <Link href="/login" className={cn(quietLink, "hidden md:inline-flex")}>
            Sign in
          </Link>

          {/* The one solid button on the page, and it is the primary action. */}
          <Link
            href="/book/grok-fde"
            className={cn(
              "inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] px-4 text-[15px] font-semibold tracking-[-0.01em]",
              "transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] active:scale-[0.99]",
              onFilm
                ? "bg-paper text-ink hover:bg-white"
                : "bg-ink text-paper hover:bg-ink-lift",
            )}
          >
            Book a call
          </Link>

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="marketing-menu"
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] md:hidden",
              "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]",
              onFilm ? "text-white hover:bg-white/10" : "text-ink hover:bg-hover",
            )}
          >
            <IconMenu size={20} />
          </button>
        </nav>
      </div>

      {menuOpen && (
        <div
          ref={panelRef}
          id="marketing-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-60 flex flex-col bg-paper text-ink md:hidden"
        >
          <div className="flex h-20 shrink-0 items-center justify-between px-6">
            <span className="text-[17px] font-semibold tracking-[-0.02em]">
              Grok FDE
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="-mr-2.5 inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-ink-2 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-hover hover:text-ink active:scale-[0.99]"
            >
              <IconX size={20} />
            </button>
          </div>

          <nav
            aria-label="Menu"
            className="flex flex-1 flex-col overflow-y-auto px-6 pb-10"
          >
            <ul className="mb-8 border-t border-rule">
              {[...LINKS, { href: "/login", label: "Sign in" }].map((link) => (
                <li key={link.href} className="border-b border-rule">
                  <Link
                    href={link.href}
                    onClick={close}
                    className="flex min-h-14 items-center py-4 text-[19px] font-medium tracking-[-0.02em] text-ink transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:text-ink-2"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="/book/grok-fde"
              onClick={close}
              className="mt-auto flex h-12 w-full shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-ink text-[16px] font-semibold text-paper transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-ink-lift active:scale-[0.99]"
            >
              Book a call
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
