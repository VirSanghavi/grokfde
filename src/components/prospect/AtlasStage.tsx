"use client";

import { AgentPortrait } from "@/components/prospect/AgentPortrait";
import { DEFAULT_PERSONA, getPersonaById, personaForSlug } from "@/lib/personas";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";

/**
 * The live call visual, and the one signature moment in the product.
 *
 * WHY THE PHOTOGRAPH IS GONE. public/agents/atlas-face.jpg is a photorealistic
 * studio headshot, and a photograph cannot be articulated. The first attempt at
 * a mouth proved it: a blurred oval pinned at a hardcoded 58% of the frame,
 * tracking nothing, sliding off the face at every aspect ratio. The second
 * attempt was to show the still image and call the stillness honest, which just
 * meant the person on the other end of a live voice call had a frozen face.
 *
 * The answer is a drawn person. A stylized vector portrait has real landmarks,
 * so the jaw, the lips, the lids and the gaze are all addressable, and each one
 * can be driven by a signal that is genuinely true rather than decorated:
 *
 *   - the mouth from the RMS envelope of the audio ACTUALLY being played,
 *     shaped by visemes mapped from the streaming transcript
 *   - the meter and the waveform from that same envelope
 *   - the head leaning in from the visitor's own microphone level
 *
 * Nothing here animates on a timer except the idle life a living face has and a
 * photograph never can: blinks, breath, and a slow drift.
 *
 * Levels arrive through refs rather than state on purpose. They update at
 * roughly 100Hz, and re-rendering React at that rate to move one bar would burn
 * the main thread during the exact moment the product is being judged.
 */

const BARS = 64;

export function AtlasStage({
  agentName,
  levelRef,
  inputLevelRef,
  speaking,
  listening,
  connecting,
  agentTranscript,
  className,
}: {
  agentName: string;
  /**
   * Still accepted because CallStage passes it, and unused because the portrait
   * is drawn rather than photographed. Its owner can drop the prop and the
   * "/agents/atlas-face.jpg" default whenever convenient. Deliberately not
   * destructured, so there is no unused local.
   */
  faceImageUrl?: string;
  levelRef: MutableRefObject<number>;
  inputLevelRef: MutableRefObject<number>;
  speaking: boolean;
  listening: boolean;
  connecting: boolean;
  /** Cumulative text of the current agent turn. Drives mouth SHAPE. */
  agentTranscript?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<Float32Array>(new Float32Array(BARS));
  const speakingRef = useRef(speaking);

  /**
   * The persona carries the whole drawing: gender, skin, hair, garment,
   * glasses. It is resolved from the displayed name because that name IS the
   * xAI voice id, so what you see and what you hear cannot drift apart. That
   * pairing is the fix for "the voice is a woman and the picture is a man".
   * A company that set a custom agent name still gets a stable, deterministic
   * engineer rather than everyone sharing one default.
   */
  const persona = useMemo(() => {
    const key = agentName.trim().toLowerCase();
    if (!key) return DEFAULT_PERSONA;
    return getPersonaById(key) ?? personaForSlug(key);
  }, [agentName]);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let stopped = false;

    const draw = () => {
      if (stopped) return;

      const agent = levelRef.current;
      const input = inputLevelRef.current;
      // Whoever is actually making sound owns the meter.
      const active = speakingRef.current ? agent : Math.max(input, agent);

      const meter = meterRef.current;
      if (meter) {
        meter.style.transform = `scaleX(${0.06 + Math.min(active, 1) * 0.94})`;
        meter.style.opacity = String(0.35 + Math.min(active, 1) * 0.65);
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const history = historyRef.current;
      if (reduced) {
        // Still truthful, just not scrolling: one bar showing current level.
        history.fill(active);
      } else {
        history.copyWithin(0, 1);
        history[BARS - 1] = active;
      }

      const gap = 2;
      const barWidth = Math.max(1, (w - gap * (BARS - 1)) / BARS);
      // Vermilion is reserved for live state, and this is the live state.
      ctx.fillStyle = speakingRef.current
        ? "rgb(214, 64, 31)"
        : "rgba(255, 255, 255, 0.55)";

      for (let i = 0; i < BARS; i++) {
        const v = Math.min(1, history[i] ?? 0);
        const barHeight = Math.max(2, v * h);
        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [levelRef, inputLevelRef]);

  return (
    <div className={cn("flex min-h-0 flex-col items-center justify-center", className)}>
      <div className="relative w-full max-w-[clamp(16rem,40vh,25rem)]">
        <div className="relative overflow-hidden rounded-[var(--radius-panel)] bg-stage-raise">
          <AgentPortrait
            persona={persona}
            levelRef={levelRef}
            inputLevelRef={inputLevelRef}
            speaking={speaking}
            listening={listening}
            agentTranscript={agentTranscript}
            className="block aspect-[4/5] w-full"
          />
          {connecting && (
            <div className="absolute inset-0 flex items-end bg-stage/60 p-4">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-stage-ink-2">
                Connecting
              </p>
            </div>
          )}
        </div>

        {/* Level rule pinned to the portrait. Real RMS, not a timed animation. */}
        <div className="mt-3 h-[2px] w-full overflow-hidden bg-white/10">
          <div
            ref={meterRef}
            className="h-full w-full origin-left"
            style={{
              backgroundColor: speaking ? "var(--color-live)" : "rgba(255,255,255,0.6)",
              transform: "scaleX(0.06)",
            }}
          />
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-stage-ink">
            {agentName}
          </p>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-stage-ink-2">
            {connecting
              ? "Connecting"
              : speaking
                ? "Speaking"
                : listening
                  ? "Listening"
                  : "Connected"}
          </p>
        </div>

        {/* Inside the portrait column, not floating beside it. The meter is
            this person's voice, so it has to read as part of them rather than
            as a decorative graphic sharing the stage. */}
        <canvas ref={canvasRef} aria-hidden className="mt-5 h-12 w-full sm:h-14" />
      </div>
    </div>
  );
}
