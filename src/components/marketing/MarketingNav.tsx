"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#channels", label: "Channels" },
  { href: "/fde/grok-fde", label: "Demo" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3.5 sm:px-4 sm:pt-4">
      <nav
        className={cn(
          "pointer-events-auto flex h-[52px] w-full max-w-[1080px] items-center rounded-full px-2 sm:h-[56px] sm:px-2.5",
          "border border-white/[0.14] backdrop-blur-[20px] backdrop-saturate-150",
          "transition-[background,box-shadow,border-color] duration-300 ease-out",
          scrolled
            ? "bg-[rgba(28,33,40,0.78)] shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
            : "bg-[rgba(72,82,96,0.38)] shadow-[0_8px_30px_rgba(0,0,0,0.18)]",
        )}
        aria-label="Primary"
      >
        {/* Wordmark only — Leaki-style, no badge clutter */}
        <Link
          href="/"
          className="flex h-full shrink-0 items-center px-4 text-[17px] font-semibold tracking-[-0.02em] text-white"
        >
          Grok FDE
        </Link>

        <div className="mx-auto hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-[14px] font-medium text-white/78 transition-colors duration-200 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1 pr-1">
          <Link
            href="/login"
            className="hidden rounded-full px-3.5 py-2 text-[13.5px] font-medium text-white/70 transition-colors hover:text-white sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-[13.5px] font-semibold tracking-[-0.01em] text-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-transform duration-150 hover:bg-[#f8fafc] active:scale-[0.98]"
          >
            Deploy your FDE
          </Link>
        </div>
      </nav>
    </div>
  );
}
