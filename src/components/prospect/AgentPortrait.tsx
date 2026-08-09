"use client";

import { buildPortrait, mouthPaths, BASE_TILT } from "@/components/prospect/portrait-art";
import { MouthDriver } from "@/components/prospect/visemes";
import type { Persona } from "@/lib/personas";
import { useEffect, useId, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";

/**
 * The rig. Builds the portrait once, then writes attributes on the nodes it
 * cares about at 60fps.
 *
 * React does not own the interior of this tree, and that is deliberate. The
 * envelope updates at roughly 100Hz; re-rendering a component tree at that rate
 * to move a lip would burn the main thread during the exact thirty seconds the
 * product is being judged. So the SVG is injected once and the loop mutates it,
 * which is the same reason the levels arrive as refs rather than as state.
 *
 * Everything that moves here is driven by something real, or by idle life that
 * a living face has and a still image does not:
 *
 *   jaw + lips   the RMS envelope of the audio actually being played, shaped by
 *                visemes mapped from the streaming transcript
 *   brows        emphasis on loud passages, a small raise while listening
 *   head         slow drift, plus a lean toward the visitor when they talk
 *   eyes         irregular blinks, occasional doubles, small gaze saccades
 *   chest        breathing, always
 *
 * Under prefers-reduced-motion the loop never starts and the portrait holds the
 * rest pose the markup already carries.
 */

type Props = {
  persona: Persona;
  levelRef: MutableRefObject<number>;
  inputLevelRef: MutableRefObject<number>;
  speaking: boolean;
  listening: boolean;
  /** Cumulative transcript of the current agent turn, for viseme shapes. */
  agentTranscript?: string;
  className?: string;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const r2 = (v: number) => Math.round(v * 100) / 100;

export function AgentPortrait({
  persona,
  levelRef,
  inputLevelRef,
  speaking,
  listening,
  agentTranscript = "",
  className,
}: Props) {
  const rawId = useId();
  // useId produces ":r0:", and a colon inside url(#...) is not addressable.
  const uid = useMemo(() => `ap${rawId.replace(/[^a-zA-Z0-9]/g, "")}`, [rawId]);
  const rig = useMemo(() => buildPortrait(persona, uid), [persona, uid]);

  const hostRef = useRef<HTMLDivElement>(null);
  const speakingRef = useRef(speaking);
  const listeningRef = useRef(listening);
  const transcriptRef = useRef(agentTranscript);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);
  useEffect(() => {
    transcriptRef.current = agentTranscript;
  }, [agentTranscript]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const pick = <T extends Element>(key: string) =>
      host.querySelector<T>(`#${uid}-${key}`);

    const head = pick<SVGGElement>("head");
    const jaw = pick<SVGGElement>("jaw");
    const body = pick<SVGGElement>("body");
    const brows = pick<SVGGElement>("brows");
    const lidL = pick<SVGGElement>("lid-l");
    const lidR = pick<SVGGElement>("lid-r");
    const gazeL = pick<SVGGElement>("gaze-l");
    const gazeR = pick<SVGGElement>("gaze-r");
    const mLips = pick<SVGPathElement>("mouth-lips");
    const mCavity = pick<SVGPathElement>("mouth-cavity");
    const mCavityClip = pick<SVGPathElement>("cavity-clip-path");
    const mTeeth = pick<SVGPathElement>("mouth-teeth");
    const mUpper = pick<SVGPathElement>("mouth-upper");
    const mLight = pick<SVGPathElement>("mouth-light");
    const mSeam = pick<SVGPathElement>("mouth-seam");
    const mUnder = pick<SVGPathElement>("mouth-under");

    const g = rig.geom;
    const driver = new MouthDriver();

    let raf = 0;
    let stopped = false;
    let prev = performance.now();
    const t0 = prev;

    // Blink state. Irregular by design: a fixed interval reads as a machine.
    let nextBlink = 900 + Math.random() * 2200;
    let blinkStart = -1;
    let blinkQueued = 0;
    let blink = 0;

    // Gaze saccades: a small, fast move, then a long hold.
    let gazeX = 0;
    let gazeY = 0;
    let gazeToX = 0;
    let gazeToY = 0;
    let nextSaccade = 1400 + Math.random() * 2200;

    // Emphasis, driven by onsets in the agent's own audio.
    let emphasis = 0;
    let lastEnv = 0;
    let nod = 0;
    let wasSpeaking = false;

    const draw = (now: number) => {
      if (stopped) return;
      const dt = Math.min(now - prev, 64);
      prev = now;
      const t = (now - t0) / 1000;
      const elapsed = now - t0;

      const isSpeaking = speakingRef.current;
      const isListening = listeningRef.current;
      const level = clamp01(levelRef.current);
      const input = clamp01(inputLevelRef.current);

      /* ── Mouth ────────────────────────────────────────────────────────── */
      // Sound stopped, so drop the lookahead the driver had not reached yet.
      // Note this is NOT a turn boundary: the player worklet reports a drain on
      // any ring buffer underrun, so jitter mid-sentence lands here too. See
      // endTurn for why it keeps its transcript watermark.
      if (wasSpeaking && !isSpeaking) driver.endTurn();
      wasSpeaking = isSpeaking;

      if (isSpeaking) driver.pushTranscript(transcriptRef.current);
      const params = driver.step(dt, isSpeaking ? level : 0, isSpeaking);

      // Listening is not a dead mouth. The corners lift a little while the
      // visitor is talking, which is what "someone is paying attention to you"
      // looks like on a face.
      const attentive = isListening ? Math.min(0.22, input * 0.5) : 0;
      const shaped = {
        open: params.open,
        wide: params.wide + attentive,
        round: params.round,
        teeth: params.teeth,
      };

      const m = mouthPaths(g, shaped);
      mLips?.setAttribute("d", m.lips);
      mCavity?.setAttribute("d", m.cavity);
      mCavity?.setAttribute("opacity", String(r2(m.cavityOpacity)));
      mCavityClip?.setAttribute("d", m.cavity);
      mTeeth?.setAttribute("d", m.teeth);
      mTeeth?.setAttribute(
        "opacity",
        String(r2(shaped.teeth * Math.min(1, shaped.open * 6 + 0.35))),
      );
      mUpper?.setAttribute("d", m.upperShade);
      mLight?.setAttribute("d", m.lowerLight);
      mSeam?.setAttribute("d", m.seam);
      mSeam?.setAttribute("opacity", String(r2(m.seamOpacity * 0.75)));
      mUnder?.setAttribute("d", m.underShadow);

      // The jaw does not just part the lips, it lengthens the lower face. The
      // scale is anchored at the crown so the skull and the eyes stay put and
      // only the chin travels, which is how a jaw actually works.
      const jawScale = 1 + shaped.open * 0.016;
      jaw?.setAttribute(
        "transform",
        `translate(0 ${r2(g.crownY * (1 - jawScale))}) scale(1 ${r2(jawScale)})`,
      );

      /* ── Emphasis and nods ────────────────────────────────────────────── */
      const env = driver.envelope;
      const rise = env - lastEnv;
      lastEnv = env;
      if (isSpeaking && rise > 0.06) {
        emphasis = Math.min(1, emphasis + rise * 2.2);
        nod = Math.min(1, nod + rise * 1.4);
      }
      emphasis *= Math.exp(-dt / 260);
      nod *= Math.exp(-dt / 420);

      /* ── Blink ────────────────────────────────────────────────────────── */
      if (blinkStart < 0 && elapsed > nextBlink) {
        blinkStart = now;
        // Roughly one blink in five is a double. It is the detail that stops
        // the eyes reading as a loop.
        blinkQueued = Math.random() < 0.2 ? 1 : 0;
      }
      if (blinkStart >= 0) {
        const p = now - blinkStart;
        if (p < 55) blink = p / 55;
        else if (p < 82) blink = 1;
        else if (p < 160) blink = 1 - (p - 82) / 78;
        else {
          blink = 0;
          blinkStart = -1;
          if (blinkQueued > 0) {
            blinkQueued -= 1;
            blinkStart = now + 60;
          } else {
            // Listening eyes blink a touch more often than speaking ones.
            const base = isListening ? 1900 : 2600;
            nextBlink = elapsed + base + Math.random() * 3400;
          }
        }
        if (blinkStart > now) blink = 0;
      }
      const ease = blink * blink * (3 - 2 * blink);
      lidL?.setAttribute("transform", `translate(0 ${r2(ease * rig.eyeTravel.left)})`);
      lidR?.setAttribute("transform", `translate(0 ${r2(ease * rig.eyeTravel.right)})`);

      /* ── Gaze ─────────────────────────────────────────────────────────── */
      if (elapsed > nextSaccade) {
        const reach = isListening ? 1.2 : 2.1;
        gazeToX = (Math.random() * 2 - 1) * reach;
        gazeToY = (Math.random() * 2 - 1) * reach * 0.55;
        nextSaccade = elapsed + 1300 + Math.random() * 2600;
      }
      const gk = 1 - Math.exp(-dt / 70);
      gazeX += (gazeToX - gazeX) * gk;
      gazeY += (gazeToY - gazeY) * gk;
      const gaze = `translate(${r2(gazeX)} ${r2(gazeY)})`;
      gazeL?.setAttribute("transform", gaze);
      gazeR?.setAttribute("transform", gaze);

      /* ── Brows ────────────────────────────────────────────────────────── */
      const browLift = emphasis * 1.9 + (isListening ? Math.min(1.4, input * 3) : 0);
      brows?.setAttribute("transform", `translate(0 ${r2(-browLift)})`);

      /* ── Head drift, lean and breath ──────────────────────────────────── */
      const driftX = Math.sin(t * 0.31) * 1.5 + Math.sin(t * 0.17 + 1.3) * 0.9;
      const driftY = Math.sin(t * 0.23 + 0.7) * 1.1 + nod * 1.8;
      // Leaning in while the visitor speaks is the whole point of the
      // listening state: it has to react to them, not just wait.
      const lean = isListening ? Math.min(1, input * 2.4) : 0;
      const rot =
        BASE_TILT +
        Math.sin(t * 0.19) * 0.85 +
        Math.sin(t * 0.41 + 2) * 0.3 +
        lean * 1.1 -
        emphasis * 0.35;
      head?.setAttribute(
        "transform",
        `rotate(${r2(rot)} ${r2(g.midX)} 360) translate(${r2(driftX + lean * 1.2)} ${r2(driftY)})`,
      );

      const breath = Math.sin(t * 1.4);
      const bs = 1 + breath * 0.0035;
      body?.setAttribute(
        "transform",
        `translate(0 ${r2(400 * (1 - bs) + breath * 0.5)}) scale(1 ${r2(bs)})`,
      );

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [rig, uid, levelRef, inputLevelRef]);

  return (
    <div
      ref={hostRef}
      className={className}
      // The markup is generated by buildPortrait from persona data. There is no
      // user-supplied string anywhere in it.
      dangerouslySetInnerHTML={{ __html: rig.svg }}
    />
  );
}
