"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#channels", label: "Channels" },
  { href: "/fde/grok-fde", label: "Live demo" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-4 sm:px-5 sm:pt-5">
      <nav
        className={cn(
          "pointer-events-auto flex w-full max-w-5xl items-center gap-3 rounded-full border px-3 py-2 sm:px-4 sm:py-2.5",
          "backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          scrolled
            ? "border-white/15 bg-[rgba(18,22,28,0.72)] shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
            : "border-white/20 bg-[rgba(55,65,78,0.42)] shadow-[0_8px_32px_rgba(0,0,0,0.18)]",
        )}
        aria-label="Primary"
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1.5 pr-2 text-white"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[10px] font-semibold tracking-tight text-slate-900">
            FDE
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Grok FDE</span>
        </Link>

        <div className="mx-auto hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-1.5 text-[13.5px] font-medium text-white/80 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-full px-3 py-1.5 text-[13px] font-medium text-white/75 transition-colors hover:text-white sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-[13.5px] font-semibold text-slate-900 shadow-sm transition-all duration-150 hover:bg-white/95 active:scale-[0.98]"
          >
            Deploy your FDE
          </Link>
        </div>
      </nav>
    </div>
  );
}
