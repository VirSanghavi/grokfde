"use client";

import { cn } from "@/lib/utils";
import type { CallMedia, CallSpeakingState } from "@/types/ui";
import { useEffect, useRef, useState } from "react";

/**
 * Video-first face stage for live FDE calls.
 *
 * Priority:
 * 1. Live MediaStream (attachStream) — Person B / WebRTC
 * 2. media.streamUrl — remote progressive/HLS URL
 * 3. media.faceVideoUrl — talking loop while agent speaks
 * 4. media.faceImageUrl — still portrait + speaking chrome
 * 5. Initials fallback
 */
export function CallVideoStage({
  agentName,
  media,
  speakingState,
  status,
  className,
  attachStream,
}: {
  agentName: string;
  media?: CallMedia;
  speakingState: CallSpeakingState;
  status: "connecting" | "connected" | "ending" | "ended";
  className?: string;
  /** Optional live WebRTC / mic-synced face stream from browser APIs. */
  attachStream?: MediaStream | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const isSpeaking = speakingState === "speaking" && status === "connected";
  const isThinking = speakingState === "thinking" && status === "connected";
  const isListening = speakingState === "listening" && status === "connected";

  const faceImage = media?.faceImageUrl;
  const faceVideo = media?.faceVideoUrl;
  const streamUrl = media?.streamUrl;

  // Prefer live stream → remote URL → talking clip
  const activeVideoSrc = !videoFailed
    ? attachStream
      ? null // stream attached via srcObject
      : streamUrl || (isSpeaking && faceVideo ? faceVideo : faceVideo && status === "connected" ? faceVideo : null)
    : null;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (attachStream) {
      el.srcObject = attachStream;
      el.muted = true;
      void el.play().catch(() => undefined);
      return () => {
        el.srcObject = null;
      };
    }

    el.srcObject = null;
    if (activeVideoSrc) {
      el.src = activeVideoSrc;
      el.loop = !streamUrl;
      el.muted = true;
      void el.play().catch(() => undefined);
    } else {
      el.removeAttribute("src");
      el.load();
    }
  }, [attachStream, activeVideoSrc, streamUrl, isSpeaking]);

  // When agent stops speaking and we only have a talking clip, freeze on poster
  useEffect(() => {
    const el = videoRef.current;
    if (!el || attachStream || streamUrl || !faceVideo) return;
    if (isSpeaking) {
      void el.play().catch(() => undefined);
    } else if (!streamUrl) {
      // Keep last frame visible; pause talking loop
      el.pause();
    }
  }, [isSpeaking, attachStream, streamUrl, faceVideo]);

  const showVideo =
    Boolean(attachStream || (activeVideoSrc && !videoFailed)) && status !== "connecting";
  const showImage = !showVideo && Boolean(faceImage) && !imageFailed;
  const initials = agentName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative aspect-[4/5] w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] bg-fg sm:aspect-video sm:max-w-none",
        className
      )}
    >
      {/* Video layer */}
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
          showVideo ? "opacity-100" : "opacity-0"
        )}
        playsInline
        autoPlay
        muted
        poster={faceImage}
        onError={() => setVideoFailed(true)}
      />

      {/* Still face */}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faceImage}
          alt={agentName}
          className={cn(
            "absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700",
            isSpeaking && "scale-[1.02]",
            status === "connecting" && "scale-105 opacity-80"
          )}
          onError={() => setImageFailed(true)}
        />
      )}

      {/* Initials fallback */}
      {!showVideo && !showImage && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-fg to-fg/90">
          <span className="text-6xl font-semibold tracking-tight text-accent-fg/90">{initials}</span>
        </div>
      )}

      {/* Soft vignette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-fg/50 via-transparent to-fg/10" />

      {/* Connecting shimmer */}
      {status === "connecting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-fg/40 backdrop-blur-[2px]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="mt-4 text-sm font-medium text-white/90">Connecting video…</p>
        </div>
      )}

      {/* Speaking / listening rings */}
      {status === "connected" && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-5">
          <div
            className={cn(
              "absolute bottom-4 left-1/2 h-16 w-[70%] -translate-x-1/2 rounded-full blur-2xl transition-all duration-300",
              isSpeaking && "bg-call/50",
              isListening && "bg-success/30",
              isThinking && "bg-warning/30",
              speakingState === "idle" && "bg-white/10"
            )}
          />
        </div>
      )}

      {/* Bottom chrome: name + state + audio meters */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white drop-shadow-sm">
            {media?.displayName || agentName}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-white/80">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                status === "connected" && isSpeaking && "bg-call animate-pulse-soft",
                status === "connected" && isListening && "bg-success",
                status === "connected" && isThinking && "bg-warning animate-pulse-soft",
                status === "connected" && speakingState === "idle" && "bg-white/70",
                status === "connecting" && "bg-white/50 animate-pulse-soft",
                status === "ending" && "bg-warning",
                status === "ended" && "bg-white/40"
              )}
            />
            {status === "connecting" && "Connecting"}
            {status === "connected" && isSpeaking && "Speaking"}
            {status === "connected" && isListening && "Listening"}
            {status === "connected" && isThinking && "Thinking"}
            {status === "connected" && speakingState === "idle" && "Connected"}
            {status === "ending" && "Ending call"}
            {status === "ended" && "Call ended"}
          </p>
        </div>

        {status === "connected" && (
          <div className="flex h-8 items-end gap-0.5 rounded-full bg-black/35 px-2.5 py-1.5 backdrop-blur-sm">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "w-1 rounded-full bg-white/90",
                  isSpeaking ? "wave-bar" : "h-1.5 opacity-50"
                )}
                style={
                  isSpeaking
                    ? {
                        height: `${8 + ((i * 11) % 14)}px`,
                        animationDelay: `${i * 0.07}s`,
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Speaking lip-sync proxy when only still image (no video track yet) */}
      {showImage && isSpeaking && (
        <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
          <div className="speaking-mouth h-2 w-8 rounded-full bg-black/25 blur-[1px]" />
        </div>
      )}
    </div>
  );
}
