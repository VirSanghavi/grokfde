/**
 * Agent personas.
 *
 * Every company's engineer must be a COHERENT identity: the displayed name, the
 * synthesized voice, and the drawn portrait all agree. Before this existed, every
 * company was created with the name "Atlas" and the voice "eve", so a male name and
 * a male portrait spoke in a woman's voice, and every customer got the identical
 * agent. Both were immediately obvious to anyone who used the product.
 *
 * xAI's voice ids are themselves human names, so a persona uses the voice's own name
 * as the display name. That makes an incoherent pairing structurally impossible: you
 * cannot pick the voice and the name separately and get them out of sync.
 *
 * Portraits are drawn as vector avatars from `appearance`, not photographs. A photo
 * cannot be articulated for real-time lip sync without landing in the uncanny valley,
 * and a stylized character can be rigged, recolored, and animated honestly.
 */

export type PersonaGender = "male" | "female";

export type PersonaAppearance = {
  /** Base skin tone for the drawn portrait. */
  skin: string;
  /** Hair fill. */
  hair: string;
  /** Broad silhouette of the hair, interpreted by the avatar renderer. */
  hairStyle: "short" | "cropped" | "wavy" | "long" | "tied" | "curly";
  /** Garment fill, kept desaturated so it never competes with the live accent. */
  garment: string;
  facialHair?: "none" | "stubble" | "beard";
  glasses?: boolean;
};

export type Persona = {
  /** Stable id stored on the company. Never render this. */
  id: string;
  /** Display name AND the xAI voice id. They are deliberately the same string. */
  name: string;
  voice: string;
  gender: PersonaGender;
  appearance: PersonaAppearance;
};

/**
 * Voice ids verified live against GET https://api.x.ai/v1/tts/voices, including the
 * gender each one reports. Do not add a persona whose voice is not on that list.
 */
export const PERSONAS: readonly Persona[] = [
  {
    id: "atlas",
    name: "Atlas",
    voice: "atlas",
    gender: "male",
    appearance: {
      skin: "#C08A62",
      hair: "#241C16",
      hairStyle: "short",
      garment: "#2B3138",
      facialHair: "stubble",
    },
  },
  {
    id: "iris",
    name: "Iris",
    voice: "iris",
    gender: "female",
    appearance: {
      skin: "#E0B392",
      hair: "#3A2A20",
      hairStyle: "wavy",
      garment: "#3A3630",
    },
  },
  {
    id: "orion",
    name: "Orion",
    voice: "orion",
    gender: "male",
    appearance: {
      skin: "#8A5A3B",
      hair: "#15100C",
      hairStyle: "cropped",
      garment: "#333A33",
      facialHair: "beard",
    },
  },
  {
    id: "luna",
    name: "Luna",
    voice: "luna",
    gender: "female",
    appearance: {
      skin: "#F0CBAA",
      hair: "#6B4A2F",
      hairStyle: "tied",
      garment: "#2F3540",
      glasses: true,
    },
  },
  {
    id: "leo",
    name: "Leo",
    voice: "leo",
    gender: "male",
    appearance: {
      skin: "#EBC49B",
      hair: "#8A5C32",
      hairStyle: "wavy",
      garment: "#38332E",
    },
  },
  {
    id: "celeste",
    name: "Celeste",
    voice: "celeste",
    gender: "female",
    appearance: {
      skin: "#7A4E33",
      hair: "#1A1210",
      hairStyle: "curly",
      garment: "#343A3A",
    },
  },
  {
    id: "kepler",
    name: "Kepler",
    voice: "kepler",
    gender: "male",
    appearance: {
      skin: "#D9A97F",
      hair: "#4A4A4E",
      hairStyle: "short",
      garment: "#30353C",
      glasses: true,
    },
  },
  {
    id: "ara",
    name: "Ara",
    voice: "ara",
    gender: "female",
    appearance: {
      skin: "#C98F66",
      hair: "#2A1D17",
      hairStyle: "long",
      garment: "#3A3440",
    },
  },
] as const;

export const DEFAULT_PERSONA: Persona = PERSONAS[0]!;

export function getPersonaById(id: string | null | undefined): Persona | undefined {
  if (!id) return undefined;
  return PERSONAS.find((p) => p.id === id.toLowerCase());
}

/**
 * Resolve a persona from whatever a company row actually has. Companies created
 * before personas existed only stored a name and a voice, and many stored the
 * mismatched "Atlas" plus "eve" pair, so match on voice first (it is the field that
 * actually drives what you hear), then on name, then fall back to a stable
 * per-company assignment.
 */
export function resolvePersona(company: {
  slug?: string | null;
  agent_name?: string | null;
  agent_voice?: string | null;
  agent_persona?: string | null;
}): Persona {
  const explicit = getPersonaById(company.agent_persona);
  if (explicit) return explicit;

  const voice = company.agent_voice?.toLowerCase();
  const byVoice = PERSONAS.find((p) => p.voice === voice);
  if (byVoice) return byVoice;

  const name = company.agent_name?.toLowerCase();
  const byName = PERSONAS.find((p) => p.name.toLowerCase() === name);
  if (byName) return byName;

  return personaForSlug(company.slug ?? "");
}

/**
 * Deterministic per-company assignment, so two companies that never chose a persona
 * still get visibly different engineers instead of everyone meeting the same "Atlas".
 * Stable across restarts because it is a pure function of the slug.
 */
export function personaForSlug(slug: string): Persona {
  if (!slug) return DEFAULT_PERSONA;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return PERSONAS[hash % PERSONAS.length]!;
}

/**
 * The agent's name as it should appear anywhere in the UI. Never hardcode "Atlas":
 * it is one company's engineer, not the product's.
 */
export function agentDisplayName(company: {
  agent_name?: string | null;
  agent_voice?: string | null;
  agent_persona?: string | null;
  slug?: string | null;
}): string {
  return company.agent_name?.trim() || resolvePersona(company).name;
}
