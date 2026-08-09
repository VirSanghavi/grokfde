import type { CallTranscriptLine } from "@/types/ui";

/** In-progress speech, rendered as a single bubble that rewrites in place. */
export type LiveLine = {
  speaker: "agent" | "prospect";
  text: string;
  turnId?: number;
};

/** How long after the previous segment a new one still counts as the same turn. */
const SAME_TURN_WINDOW_MS = 15_000;

/**
 * Merge a finalised segment into the turn it belongs to.
 *
 * Server VAD chops one spoken sentence into several transcription segments. If
 * each became its own message, saying "so I was thinking about the rollout"
 * would render as a stack of growing fragments. Segments sharing a turn id
 * extend the existing bubble instead; when the provider sends no turn id we
 * fall back to merging consecutive same-speaker segments that arrive close
 * together.
 */
export function upsertTurn(
  prev: CallTranscriptLine[],
  line: CallTranscriptLine,
): CallTranscriptLine[] {
  const last = prev[prev.length - 1];
  if (!last || last.speaker !== line.speaker) return [...prev, line];

  const sameTurn =
    line.turnId !== undefined && last.turnId !== undefined
      ? last.turnId === line.turnId
      : +new Date(line.at) - +new Date(last.at) < SAME_TURN_WINDOW_MS;

  if (!sameTurn) return [...prev, line];

  return [...prev.slice(0, -1), { ...last, text: mergeText(last.text, line.text), at: line.at }];
}

/**
 * Providers re-send the whole turn on some events and only the increment on
 * others, so naive concatenation duplicates text.
 */
function mergeText(existing: string, incoming: string): string {
  const a = existing.trim();
  const b = incoming.trim();
  if (!a) return b;
  if (!b) return a;
  // Whole turn resent, or an extension of it.
  if (b.startsWith(a)) return b;
  // Increment already accounted for.
  if (a.endsWith(b) || a.includes(b)) return a;
  return `${a} ${b}`.replace(/\s+/g, " ");
}
