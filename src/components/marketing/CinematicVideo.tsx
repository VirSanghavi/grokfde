"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  poster: string;
  className?: string;
  overlayClassName?: string;
  gradient?: "hero" | "footer" | "none";
  /** When true, apply CSS L→R pan (use only if the MP4 has no camera motion). */
  cssPan?: boolean;
};

/**
 * Full-bleed cinematic background.
 * Prefer MP4 with a baked slow left→right pan (constant zoom, no Y drift).
 * CSS pan is off by default so we never stack two motions (that reads as shake).
 */
export function CinematicVideo({
  src,
  poster,
  className,
  overlayClassName,
  gradient = "hero",
  cssPan = false,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);

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
        void video.play().catch(() => setVideoFailed(true));
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const useCssPan = cssPan || videoFailed;

  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-[#0a0e14]", className)}>
      <div
        className={cn(
          "marketing-pan absolute inset-[-4%]",
          useCssPan && "marketing-pan--css",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        {!videoFailed && (
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
            onError={() => setVideoFailed(true)}
          >
            <source src={src} type="video/mp4" />
          </video>
        )}
      </div>

      {gradient === "hero" && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
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
