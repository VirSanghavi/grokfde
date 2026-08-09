/**
 * The mouth driver: turns two live signals into a mouth shape, every frame.
 *
 * The two signals do different jobs and neither one can do the other's:
 *
 *   TIMING comes from the RMS envelope of the audio actually being played.
 *   That is frame-accurate by construction, and it is the only thing that can
 *   be, because xAI's `replace` feature changes pronunciation without changing
 *   the transcript. docs/VOICE-PROTOCOL.md is explicit about this.
 *
 *   SHAPE comes from the streaming transcript. An envelope alone can only open
 *   and close a mouth, and a mouth that only opens and closes reads as a
 *   puppet. Knowing that the current sound is an "m" and not an "ah" is what
 *   makes it read as speech.
 *
 * They are combined rather than averaged: the transcript picks WHICH shape,
 * the envelope decides HOW FAR into it the mouth travels. So an "m" stays shut
 * through a loud passage and an "ah" opens wide, which is what actually
 * happens in a face.
 *
 * The queue is advanced on energy ONSETS rather than on a timer, so the lips
 * move on the syllable and not on a metronome. If the transcript is not
 * available the same machinery runs on an energy-weighted shape pick, which is
 * coarser but never degrades to open/closed.
 */

import type { MouthParams } from "./portrait-art";

export type Viseme = "REST" | "MBP" | "AA" | "EE" | "OH" | "OO" | "FV" | "STD" | "L" | "KG";

/**
 * A small set, chosen because these are the shapes an audience can actually
 * tell apart at portrait scale. A larger set buys nothing visible and makes
 * every shape a smaller step from its neighbour.
 */
export const VISEME_SHAPES: Record<Viseme, MouthParams> = {
  REST: { open: 0.03, wide: 0, round: 0, teeth: 0 },
  MBP: { open: 0, wide: -0.06, round: 0.1, teeth: 0 },
  AA: { open: 0.95, wide: 0.26, round: 0, teeth: 0.22 },
  EE: { open: 0.48, wide: 0.68, round: 0, teeth: 0.62 },
  OH: { open: 0.6, wide: -0.5, round: 0.84, teeth: 0 },
  OO: { open: 0.3, wide: -0.74, round: 1, teeth: 0 },
  FV: { open: 0.18, wide: 0.2, round: 0, teeth: 0.95 },
  STD: { open: 0.3, wide: 0.34, round: 0, teeth: 0.7 },
  L: { open: 0.5, wide: 0.14, round: 0, teeth: 0.42 },
  KG: { open: 0.4, wide: 0.08, round: 0.12, teeth: 0.26 },
};

/** Deliberately coarse. English orthography is not phonetic and chasing that
 *  precision here would cost far more than it shows on a 200px face. */
const CHAR_VISEME: Record<string, Viseme> = {
  a: "AA",
  e: "EE",
  i: "EE",
  y: "EE",
  o: "OH",
  u: "OO",
  w: "OO",
  m: "MBP",
  b: "MBP",
  p: "MBP",
  f: "FV",
  v: "FV",
  s: "STD",
  z: "STD",
  t: "STD",
  d: "STD",
  n: "STD",
  c: "STD",
  x: "STD",
  j: "STD",
  l: "L",
  r: "L",
  k: "KG",
  g: "KG",
  h: "KG",
  q: "KG",
};

export function visemeForChar(ch: string): Viseme | null {
  return CHAR_VISEME[ch.toLowerCase()] ?? null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export type MouthDriverOptions = {
  /** Shortest gap between two shapes, in ms. Below this it reads as a buzz. */
  minHold?: number;
  /** Longest a single shape may sit while sound is still coming out. */
  maxHold?: number;
};

export class MouthDriver {
  private queue: Viseme[] = [];
  private seen = "";
  private target: MouthParams = VISEME_SHAPES.REST;
  private current: MouthParams = { ...VISEME_SHAPES.REST };
  private last: Viseme = "REST";

  private env = 0;
  private envAvg = 0;
  private above = false;
  private sinceAdvance = 0;
  private silentFor = 0;

  private readonly minHold: number;
  private readonly maxHold: number;

  constructor(opts: MouthDriverOptions = {}) {
    this.minHold = opts.minHold ?? 55;
    this.maxHold = opts.maxHold ?? 165;
  }

  /**
   * Feed the cumulative transcript of the CURRENT agent turn. Deltas are
   * derived here rather than passed in, because the caller only ever holds the
   * accumulated string; a turn that does not extend the previous one is a new
   * turn and resets the queue.
   */
  pushTranscript(text: string) {
    if (text === this.seen) return;
    let delta: string;
    if (text.startsWith(this.seen)) {
      delta = text.slice(this.seen.length);
    } else {
      this.queue.length = 0;
      delta = text;
    }
    this.seen = text;

    for (const ch of delta) {
      const v = visemeForChar(ch);
      if (!v) continue;
      // Collapse doubled letters. "ll" is one shape, not two.
      if (this.queue.length && this.queue[this.queue.length - 1] === v) continue;
      this.queue.push(v);
    }
    // Text runs ahead of audio. A long queue means we are BEHIND, so the drop
    // has to come off the front or the mouth falls further behind every turn.
    if (this.queue.length > 48) this.queue.splice(0, this.queue.length - 48);
  }

  /**
   * The agent stopped making sound. Drops pending lookahead so the next
   * utterance does not open by replaying the tail of the last one.
   *
   * It deliberately does NOT clear `seen`. The obvious version cleared it, and
   * that is a real bug: the player worklet emits `drained` on any ring buffer
   * underrun, so a moment of network jitter MID-utterance flips speaking to
   * false and back while the same turn's transcript keeps growing. Forgetting
   * the watermark there would re-queue the entire turn from the top and the
   * mouth would chew through the whole sentence again over the last second of
   * audio. Keeping the watermark makes an underrun cost nothing, and a real
   * turn change is still caught by the prefix test in pushTranscript.
   */
  endTurn() {
    this.queue.length = 0;
    this.last = "REST";
    this.target = VISEME_SHAPES.REST;
  }

  /**
   * @param dt      milliseconds since the previous frame
   * @param level   agent RMS envelope, 0..1, from the audio actually played
   * @param voicing whether the agent is currently the one making sound
   */
  step(dt: number, level: number, voicing: boolean): MouthParams {
    const step = Math.min(dt, 64);
    // Light extra smoothing on top of the worklet's own envelope. Without it
    // the onset detector fires on single-frame spikes.
    this.env += (level - this.env) * Math.min(1, step / 26);
    this.envAvg += (this.env - this.envAvg) * Math.min(1, step / 320);
    this.sinceAdvance += step;

    if (!voicing || this.env < 0.025) {
      this.silentFor += step;
    } else {
      this.silentFor = 0;
    }

    if (!voicing || this.silentFor > 130) {
      this.target = VISEME_SHAPES.REST;
      this.above = false;
      if (!voicing) this.queue.length = 0;
    } else {
      const onThreshold = this.envAvg * 1.3 + 0.045;
      const offThreshold = this.envAvg * 1.12 + 0.03;
      const rising = this.env > onThreshold;
      const onset = rising && !this.above && this.sinceAdvance >= this.minHold;
      this.above = this.env > offThreshold;

      if (onset || this.sinceAdvance >= this.maxHold) {
        this.advance();
        this.sinceAdvance = 0;
      }
    }

    // Blend, never snap. ~48ms time constant, which is fast enough to hit a
    // syllable and slow enough that the lips travel instead of teleporting.
    const k = 1 - Math.exp(-step / 48);
    this.current = {
      open: lerp(this.current.open, this.target.open, k),
      wide: lerp(this.current.wide, this.target.wide, k),
      round: lerp(this.current.round, this.target.round, k),
      teeth: lerp(this.current.teeth, this.target.teeth, k),
    };

    // The shape says how wide this sound CAN open the mouth; the envelope says
    // how much sound is actually coming out right now.
    const drive = 0.36 + 0.64 * clamp01(this.env * 1.5);
    return {
      open: this.current.open * drive,
      wide: this.current.wide,
      round: this.current.round,
      teeth: this.current.teeth,
    };
  }

  /** The current envelope, exposed so the portrait can drive brows and nods. */
  get envelope(): number {
    return this.env;
  }

  private advance() {
    let next = this.queue.shift();
    if (next && next === this.last && this.queue.length) next = this.queue.shift();
    this.last = next ?? this.pick();
    this.target = VISEME_SHAPES[this.last];
  }

  /**
   * No transcript, so pick from the energy. Loud is an open vowel, quiet is a
   * closure, and the middle is where consonants live. It is a guess, but it is
   * a guess made from the real envelope and it never repeats itself twice in a
   * row, which is enough to read as talking rather than as chewing.
   */
  private pick(): Viseme {
    const e = this.env;
    const bag: Viseme[] =
      e > 0.5
        ? ["AA", "AA", "EE", "OH"]
        : e > 0.28
          ? ["EE", "OH", "L", "STD", "AA"]
          : e > 0.12
            ? ["STD", "KG", "OO", "FV", "L"]
            : ["MBP", "STD", "REST"];
    for (let i = 0; i < 4; i++) {
      const v = bag[Math.floor(Math.random() * bag.length)]!;
      if (v !== this.last) return v;
    }
    return bag[0]!;
  }
}
