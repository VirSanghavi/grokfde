"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

type Props = {
  src: string;
  poster: string;
  className?: string;
  overlayClassName?: string;
  /** darker bottom gradient for text legibility */
  gradient?: "hero" | "footer" | "none";
};

/**
 * Full-bleed looping background video with poster fallback.
 * Muted + playsInline required for autoplay across browsers.
 * Respects prefers-reduced-motion (poster only).
 */
export function CinematicVideo({
  src,
  poster,
  className,
  overlayClassName,
  gradient = "hero",
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (mq.matches) {
        video.pause();
        video.removeAttribute("autoplay");
      } else {
        void video.play().catch(() => {
          /* autoplay blocked — poster remains */
        });
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-slate-900", className)}>
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={poster}
        aria-hidden
      >
        <source src={src} type="video/mp4" />
      </video>
      {gradient === "hero" && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            "bg-[linear-gradient(180deg,rgba(8,12,18,0.22)_0%,rgba(8,12,18,0.1)_32%,rgba(8,12,18,0.48)_68%,rgba(8,12,18,0.82)_100%)]",
            overlayClassName,
          )}
        />
      )}
      {gradient === "footer" && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            "bg-[linear-gradient(180deg,rgba(0,0,0,0.38)_0%,rgba(0,0,0,0.52)_42%,rgba(0,0,0,0.94)_80%,#000_100%)]",
            overlayClassName,
          )}
        />
      )}
    </div>
  );
}
