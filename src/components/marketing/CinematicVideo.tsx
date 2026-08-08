"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

type Props = {
  src: string;
  poster: string;
  className?: string;
  overlayClassName?: string;
  gradient?: "hero" | "footer" | "none";
};

/**
 * Full-bleed cinematic background.
 * Prefer smooth MP4; CSS sway fallback keeps motion silky if video fails.
 * Motion is a slow ease sway — never a stepped Ken Burns jump.
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
        video.muted = true;
        void video.play().catch(() => {});
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-[#0a0e14]", className)}>
      {/* CSS sway layer — always on poster for continuity; video sits on top when playing */}
      <div className="marketing-sway absolute inset-[-6%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
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
      </div>

      {gradient === "hero" && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            // Soft vignette like Leaki: light top, deeper bottom-left for type
            "bg-[linear-gradient(180deg,rgba(10,14,20,0.12)_0%,rgba(10,14,20,0.05)_28%,rgba(10,14,20,0.35)_58%,rgba(10,14,20,0.72)_100%)]",
            overlayClassName,
          )}
        />
      )}
      {gradient === "footer" && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            "bg-[linear-gradient(180deg,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0.55)_40%,rgba(0,0,0,0.92)_78%,#000_100%)]",
            overlayClassName,
          )}
        />
      )}
    </div>
  );
}
