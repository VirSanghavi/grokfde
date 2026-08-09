/**
 * Single source of truth for what the agent looks like.
 *
 * The face used on calls is derived from the configured voice, so the portrait
 * can never drift from what the caller actually hears. Adding a voice here is
 * the only place you need to touch to keep the two aligned.
 */

export type Presentation = "feminine" | "masculine" | "neutral";

export interface AgentPersona {
  /** xAI realtime voice id. */
  voice: string;
  presentation: Presentation;
  /** Short human-readable note, surfaced in the agent settings page. */
  label: string;
}

/**
 * Known xAI realtime voices. Anything not listed resolves to a neutral persona
 * rather than a guess — an unmatched face is worse than an unspecified one.
 */
const VOICES: Record<string, Omit<AgentPersona, "voice">> = {
  eve: { presentation: "feminine", label: "Eve · warm, measured, female" },
};

export const DEFAULT_VOICE = "eve";

export function personaForVoice(voice?: string | null): AgentPersona {
  const id = (voice || DEFAULT_VOICE).trim().toLowerCase();
  const known = VOICES[id];
  return {
    voice: id,
    presentation: known?.presentation ?? "neutral",
    label: known?.label ?? `${id} · presentation unspecified`,
  };
}

const APPEARANCE: Record<Presentation, string> = {
  feminine:
    "a woman in her early thirties, shoulder-length dark hair, calm confident expression, subtle smile",
  masculine:
    "a man in his early thirties, short dark hair, calm confident expression, subtle smile",
  // No gendered cues — used when we do not know what the voice sounds like.
  neutral:
    "a person in their early thirties with short hair, calm confident expression, subtle smile",
};

/** Portrait still shown while connecting, idle, or if video generation fails. */
export function facePortraitPrompt(persona: AgentPersona, agentName: string): string {
  return [
    `Photorealistic corporate headshot of ${APPEARANCE[persona.presentation]}.`,
    `This is ${agentName}, a forward-deployed software engineer.`,
    "Shot on an 85mm lens, shallow depth of field, soft even key light,",
    "plain light grey studio backdrop, dark crew-neck sweater,",
    "looking directly at camera, head and shoulders, vertical 4:5 framing.",
    "Natural skin texture, no retouching artifacts, no text, no watermark.",
  ].join(" ");
}

/** Short looping clip played while the agent is speaking. */
export function faceVideoPrompt(persona: AgentPersona, agentName: string): string {
  return [
    `Photorealistic talking-head video of ${APPEARANCE[persona.presentation]},`,
    `${agentName}, a forward-deployed software engineer, speaking to camera.`,
    "Natural mouth movement and blinking, subtle head motion, seamless loop.",
    "Plain light grey studio backdrop, soft even key light, dark crew-neck sweater,",
    "85mm lens, shallow depth of field, static camera, no text, no watermark.",
  ].join(" ");
}
