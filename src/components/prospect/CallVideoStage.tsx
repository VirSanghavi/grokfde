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
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const isSpeaking = speakingState === "speaking" && status === "connected";
  const isThinking = speakingState === "thinking" && status === "connected";
  const isListening = speakingState === "listening" && status === "connected";

  const faceImage = media?.faceImageUrl;
  const faceVideo = media?.faceVideoUrl;
  const idleVideo = media?.idleVideoUrl;
  const streamUrl = media?.streamUrl;

  // Prefer live stream → remote URL → generated loops.
  const activeVideoSrc = !videoFailed
    ? attachStream
      ? null // stream attached via srcObject
      : streamUrl || faceVideo || idleVideo || null
    : null;

  /**
   * Both loops run continuously and we crossfade opacity between them. Pausing
   * the hidden one instead would restart it from frame zero on every switch,
   * which reads as a stutter each time she starts or stops talking.
   *
   * Falls back gracefully: with only one clip generated, that clip covers both
   * states rather than leaving the stage frozen.
   */
  const talkSrc = streamUrl ? null : faceVideo ?? idleVideo ?? null;
  const idleSrc = streamUrl ? null : idleVideo ?? faceVideo ?? null;
  const showTalking = isSpeaking || !idleSrc;

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
    if (talkSrc) {
      if (el.getAttribute("src") !== talkSrc) el.src = talkSrc;
      el.loop = true;
      el.muted = true;
      void el.play().catch(() => undefined);
    } else if (streamUrl) {
      el.src = streamUrl;
      el.muted = true;
      void el.play().catch(() => undefined);
    } else {
      el.removeAttribute("src");
      el.load();
    }
  }, [attachStream, talkSrc, streamUrl]);

  useEffect(() => {
    const el = idleVideoRef.current;
    if (!el || !idleSrc) return;
    if (el.getAttribute("src") !== idleSrc) el.src = idleSrc;
    el.loop = true;
    el.muted = true;
    void el.play().catch(() => undefined);
  }, [idleSrc]);

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
      {/* Listening loop — underneath, revealed whenever she is not speaking. */}
      {idleSrc && !attachStream && (
        <video
          ref={idleVideoRef}
          className={cn(
            "absolute inset-0 h-full w-full object-contain transition-opacity duration-500",
            showVideo && !showTalking ? "opacity-100" : "opacity-0"
          )}
          playsInline
          autoPlay
          loop
          muted
          poster={faceImage}
        />
      )}

      {/* Talking loop, or the live stream when one is attached. */}
      <video
        ref={videoRef}
        className={cn(
          // Live camera streams fill; generated clips are contained so the
          // subject stays whole if the aspect ratio does not match the tile.
          "absolute inset-0 h-full w-full transition-opacity duration-500",
          attachStream ? "object-cover" : "object-contain",
          showVideo && showTalking ? "opacity-100" : "opacity-0"
        )}
        playsInline
        autoPlay
        muted
        poster={faceImage}
        onError={() => setVideoFailed(true)}
      />

      {/* Still face — contain, never cover: a portrait-shaped asset in this
          16:9 tile would otherwise be cropped to a band across the eyes. */}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faceImage}
          alt={agentName}
          className={cn(
            "absolute inset-0 h-full w-full object-contain object-center transition-opacity duration-700",
            status === "connecting" && "opacity-80"
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

    </div>
  );
}
