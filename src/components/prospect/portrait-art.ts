/**
 * The drawn engineer: a stylized vector portrait, built as SVG geometry so it
 * can be RIGGED rather than played back.
 *
 * Why this exists at all. The call stage used to show a photographic headshot,
 * and a photograph cannot be articulated: the previous attempt at a mouth was a
 * blurred oval pinned at a hardcoded 58% of the frame, tracking nothing. A
 * drawn face has real landmarks, so the jaw, the lips, the lids and the gaze
 * are all addressable, and every one of them can be driven by a signal that is
 * actually true (the agent's RMS envelope, the visitor's mic level, the
 * streaming transcript).
 *
 * Why the markup is a STRING and not JSX. Two consumers need byte-identical
 * output: the React component on the call stage, and the offline preview used
 * to iterate on the drawing. Generating the markup once means the thing that
 * was reviewed is exactly the thing that ships. It also suits the rig: at 60fps
 * the animation writes attributes directly on nodes, so React never owns the
 * interior of this tree anyway.
 *
 * On gradients. docs/DESIGN.md bans decorative gradients (hero washes, gradient
 * buttons, gradient text) and that ban holds everywhere in the product. The
 * soft falloffs here are not decoration, they are how a face is shaded: one
 * light source from the upper left, warm skin, a cool rim on the shadow edge.
 * No hue is invented; every tone is derived from the persona's own colors.
 */

import type { Persona, PersonaAppearance } from "@/lib/personas";

/* ── Color ────────────────────────────────────────────────────────────────── */

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return [128, 128, 128];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Linear blend. t=0 returns a, t=1 returns b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

/** Positive lightens toward a warm white, negative darkens toward a warm black. */
export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, "#FFF6EC", amount) : mix(hex, "#160F0A", -amount);
}

/** Relative luminance, used to keep contrast honest across eight skin tones. */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* ── Geometry ─────────────────────────────────────────────────────────────── */

export type Geom = {
  midX: number;
  crownY: number;
  templeY: number;
  browY: number;
  eyeY: number;
  cheekY: number;
  noseY: number;
  mouthY: number;
  jawY: number;
  chinY: number;
  skullHalf: number;
  cheekHalf: number;
  jawHalf: number;
  chinHalf: number;
  eyeGap: number;
  eyeHalfW: number;
  eyeUpper: number;
  eyeLower: number;
  irisR: number;
  pupilR: number;
  browThick: number;
  browArch: number;
  browHalf: number;
  noseHalf: number;
  mouthHalf: number;
  mouthOpenMax: number;
  upperLip: number;
  lowerLip: number;
  neckHalf: number;
  neckTopY: number;
  shoulderY: number;
  shoulderHalf: number;
};

/**
 * Two builds, and the difference is structural rather than cosmetic. A male
 * head is longer and squarer at the jaw with a low heavy brow; a female head is
 * shorter, tapers to a narrower chin, and carries a higher, finer brow and a
 * fuller mouth. Getting these wrong is the failure the visitor notices first,
 * because the voice tells them what they are supposed to be looking at.
 */
export function buildGeom(gender: "male" | "female"): Geom {
  if (gender === "female") {
    return {
      midX: 158,
      crownY: 56,
      templeY: 104,
      browY: 142,
      eyeY: 168,
      cheekY: 194,
      noseY: 209,
      mouthY: 232,
      jawY: 234,
      chinY: 270,
      skullHalf: 69,
      cheekHalf: 67,
      jawHalf: 53,
      chinHalf: 19,
      eyeGap: 32,
      eyeHalfW: 15.5,
      eyeUpper: 8.4,
      eyeLower: 5.8,
      irisR: 7.1,
      pupilR: 3.1,
      browThick: 3.9,
      browArch: 6.2,
      browHalf: 17,
      noseHalf: 12.5,
      mouthHalf: 22,
      mouthOpenMax: 25,
      upperLip: 8.4,
      lowerLip: 11,
      neckHalf: 24,
      neckTopY: 244,
      shoulderY: 338,
      shoulderHalf: 106,
    };
  }
  return {
    midX: 158,
    crownY: 52,
    templeY: 102,
    browY: 148,
    eyeY: 170,
    cheekY: 198,
    noseY: 214,
    mouthY: 237,
    jawY: 240,
    chinY: 276,
    skullHalf: 75,
    cheekHalf: 73,
    jawHalf: 65,
    chinHalf: 25,
    eyeGap: 33,
    eyeHalfW: 15.5,
    eyeUpper: 7.6,
    eyeLower: 5.4,
    irisR: 6.7,
    pupilR: 2.9,
    browThick: 5.4,
    browArch: 4.8,
    browHalf: 18,
    noseHalf: 15,
    mouthHalf: 25,
    mouthOpenMax: 28,
    upperLip: 6.6,
    lowerLip: 9,
    neckHalf: 30,
    neckTopY: 250,
    shoulderY: 342,
    shoulderHalf: 118,
  };
}

/** Trim the float noise out of generated path data so it stays readable. */
const n = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * Every value in the generated markup is a number or a colour computed here,
 * with one exception: the persona's name, which lands in the aria-label. It
 * comes from the PERSONAS constant today, but the markup is injected with
 * innerHTML, so it is escaped rather than trusted.
 */
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

/* ── Palette ──────────────────────────────────────────────────────────────── */

export type Palette = {
  skin: string;
  skinLit: string;
  skinShade: string;
  skinDeep: string;
  /** The line colour. Warm and dark, derived from skin. Never black. */
  ink: string;
  lip: string;
  lipShade: string;
  hair: string;
  hairLit: string;
  hairShade: string;
  garment: string;
  garmentLit: string;
  garmentShade: string;
  iris: string;
  irisLit: string;
  sclera: string;
  teeth: string;
  cavity: string;
  rim: string;
  frame: string;
};

export function buildPalette(a: PersonaAppearance, gender: "male" | "female"): Palette {
  const skin = a.skin;
  // Darker skins need a stronger lift to read as lit and a gentler push into
  // shadow, or the modelling either vanishes or turns to mud.
  const lum = luminance(skin);
  const lift = 0.2 - lum * 0.09;
  const depth = 0.3 + lum * 0.16;

  // Skin shadow goes MORE saturated and redder, never grey. Mixing toward a
  // neutral black is the single thing that makes a drawn face look like a
  // vector avatar instead of a painting, so the shadows here travel toward a
  // warm oxblood and the deepest tone picks up a cool violet edge.
  const skinShade = mix(skin, "#7A3B33", depth);
  const skinDeep = mix(skin, "#40202A", depth + 0.3);

  return {
    skin,
    skinLit: mix(skin, "#FFF1DF", lift),
    skinShade,
    skinDeep,
    ink: mix(skinDeep, "#1E1013", 0.55),
    lip: mix(skin, "#9E4438", gender === "female" ? 0.52 : 0.4),
    lipShade: mix(skin, "#6E2A22", gender === "female" ? 0.66 : 0.58),
    hair: a.hair,
    hairLit: shade(a.hair, 0.22),
    hairShade: shade(a.hair, -0.3),
    garment: a.garment,
    garmentLit: shade(a.garment, 0.12),
    garmentShade: shade(a.garment, -0.28),
    iris: mix(a.hair, "#5B3E28", 0.45),
    irisLit: mix(a.hair, "#A6784E", 0.55),
    // Never a pure white eye: it reads as plastic and blows out on a dark stage.
    sclera: "#EFE7DD",
    teeth: "#F3EDE4",
    cavity: mix(a.skin, "#2A1010", 0.82),
    rim: "#FFE9D2",
    frame: "#5A5450",
  };
}

/* ── The mouth, built from parameters every frame ─────────────────────────── */

export type MouthParams = {
  /** 0 closed, 1 fully open. Multiplied by the live RMS envelope. */
  open: number;
  /** -1 pursed, 0 neutral, 1 spread wide. */
  wide: number;
  /** 0 neutral, 1 fully rounded (o, u, w). */
  round: number;
  /** 0 hidden, 1 upper teeth clearly on show (f, v, s, ee). */
  teeth: number;
};

export type MouthPaths = {
  lips: string;
  upperShade: string;
  lowerLight: string;
  cavity: string;
  teeth: string;
  seam: string;
  seamOpacity: number;
  underShadow: string;
  cavityOpacity: number;
};

/**
 * A parametric mouth rather than a set of frozen viseme drawings. Frozen shapes
 * have to cross-fade, which double-exposes two mouths for the whole blend;
 * parameters interpolate cleanly, so an "m" opening into an "ah" travels
 * through every shape in between the way a real mouth does.
 */
export function mouthPaths(g: Geom, m: MouthParams): MouthPaths {
  const open = Math.max(0, Math.min(1, m.open));
  const wide = Math.max(-1, Math.min(1, m.wide));
  const round = Math.max(0, Math.min(1, m.round));
  const teeth = Math.max(0, Math.min(1, m.teeth));

  // A hair off centre and a hair off level. Perfect symmetry is the tell.
  const cx = g.midX + 0.8;
  const cy = g.mouthY;

  const halfW = g.mouthHalf * (1 + wide * 0.17 - round * 0.3);
  const openH = open * g.mouthOpenMax;
  // Spreading the mouth thins the lips and rounding it thickens them, which is
  // most of what separates an "ee" from an "s" at a glance.
  const upH = g.upperLip * (1 - open * 0.22) * (1 - wide * 0.2) * (1 + round * 0.18);
  const loH =
    g.lowerLip * (1 - open * 0.12) * (1 - wide * 0.22) * (1 - teeth * 0.22) * (1 + round * 0.14);

  const cornerL = cy + 0.9 - wide * 1.4;
  const cornerR = cy - 0.7 - wide * 1.4;
  // Teeth need an aperture even on a nearly shut mouth, or an "f" clips down to
  // nothing and reads as a small "ah". The floor is what makes it show.
  const innerTop = cy - Math.max(openH * 0.36, teeth * 3.4);
  const innerBot = cy + Math.max(openH * 0.64, teeth * 1.1);

  const xL = cx - halfW;
  const xR = cx + halfW;

  // Upper lip: two peaks either side of the philtrum dip, corners tucked down.
  const upper =
    `M ${n(xL)} ${n(cornerL)}` +
    ` C ${n(cx - halfW * 0.74)} ${n(cy - upH * 0.5)} ${n(cx - halfW * 0.5)} ${n(cy - upH)} ${n(cx - halfW * 0.3)} ${n(cy - upH)}` +
    ` C ${n(cx - halfW * 0.15)} ${n(cy - upH)} ${n(cx - halfW * 0.09)} ${n(cy - upH * 0.6)} ${n(cx)} ${n(cy - upH * 0.6)}` +
    ` C ${n(cx + halfW * 0.09)} ${n(cy - upH * 0.6)} ${n(cx + halfW * 0.15)} ${n(cy - upH)} ${n(cx + halfW * 0.3)} ${n(cy - upH)}` +
    ` C ${n(cx + halfW * 0.5)} ${n(cy - upH)} ${n(cx + halfW * 0.74)} ${n(cy - upH * 0.5)} ${n(xR)} ${n(cornerR)}`;

  const lowerBack =
    ` C ${n(cx + halfW * 0.78)} ${n(innerBot + loH * 0.42)} ${n(cx + halfW * 0.44)} ${n(innerBot + loH)} ${n(cx)} ${n(innerBot + loH)}` +
    ` C ${n(cx - halfW * 0.44)} ${n(innerBot + loH)} ${n(cx - halfW * 0.78)} ${n(innerBot + loH * 0.42)} ${n(xL)} ${n(cornerL)} Z`;

  const innerTopEdge =
    ` C ${n(cx - halfW * 0.6)} ${n(innerTop - openH * 0.06)} ${n(cx - halfW * 0.3)} ${n(innerTop)} ${n(cx)} ${n(innerTop)}` +
    ` C ${n(cx + halfW * 0.3)} ${n(innerTop)} ${n(cx + halfW * 0.6)} ${n(innerTop - openH * 0.06)} ${n(xR)} ${n(cornerR)}`;

  const innerBotEdge =
    ` C ${n(cx + halfW * 0.62)} ${n(innerBot)} ${n(cx + halfW * 0.34)} ${n(innerBot + openH * 0.06)} ${n(cx)} ${n(innerBot + openH * 0.06)}` +
    ` C ${n(cx - halfW * 0.34)} ${n(innerBot + openH * 0.06)} ${n(cx - halfW * 0.62)} ${n(innerBot)} ${n(xL)} ${n(cornerL)} Z`;

  const cavity = `M ${n(xL)} ${n(cornerL)}` + innerTopEdge + innerBotEdge;

  // Teeth are drawn as a plain band and clipped by the cavity, so a barely
  // parted mouth shows a sliver and a wide one shows the whole upper row.
  // That is what makes an "f" read as an "f" instead of a small "ah".
  const teethH = 2.2 + teeth * 5.4;
  const teethTop = innerTop - 1;
  const teethBand =
    `M ${n(xL - 2)} ${n(teethTop)} L ${n(xR + 2)} ${n(teethTop)}` +
    ` L ${n(xR + 2)} ${n(teethTop + teethH)}` +
    ` C ${n(cx + halfW * 0.4)} ${n(teethTop + teethH + 1.2)} ${n(cx - halfW * 0.4)} ${n(teethTop + teethH + 1.2)} ${n(xL - 2)} ${n(teethTop + teethH)} Z`;

  const seam =
    `M ${n(xL)} ${n(cornerL)}` +
    ` C ${n(cx - halfW * 0.55)} ${n(cy + 0.6)} ${n(cx - halfW * 0.2)} ${n(cy + 1)} ${n(cx)} ${n(cy + 0.8)}` +
    ` C ${n(cx + halfW * 0.2)} ${n(cy + 0.6)} ${n(cx + halfW * 0.55)} ${n(cy + 0.3)} ${n(xR)} ${n(cornerR)}`;

  const upperShade = `${upper} C ${n(cx + halfW * 0.6)} ${n(innerTop + 0.4)} ${n(cx - halfW * 0.6)} ${n(innerTop + 0.4)} ${n(xL)} ${n(cornerL)} Z`;

  const lightW = halfW * (0.42 - round * 0.16);
  const lightY = innerBot + loH * 0.52;
  const lowerLight =
    `M ${n(cx - lightW)} ${n(lightY)}` +
    ` C ${n(cx - lightW * 0.5)} ${n(lightY - 2.1)} ${n(cx + lightW * 0.5)} ${n(lightY - 2.1)} ${n(cx + lightW)} ${n(lightY)}` +
    ` C ${n(cx + lightW * 0.5)} ${n(lightY + 2.4)} ${n(cx - lightW * 0.5)} ${n(lightY + 2.4)} ${n(cx - lightW)} ${n(lightY)} Z`;

  const underY = innerBot + loH + 2.4;
  const underW = halfW * 0.72;
  const underShadow =
    `M ${n(cx - underW)} ${n(underY)}` +
    ` C ${n(cx - underW * 0.5)} ${n(underY + 3.4)} ${n(cx + underW * 0.5)} ${n(underY + 3.4)} ${n(cx + underW)} ${n(underY)}` +
    ` C ${n(cx + underW * 0.5)} ${n(underY + 0.6)} ${n(cx - underW * 0.5)} ${n(underY + 0.6)} ${n(cx - underW)} ${n(underY)} Z`;

  return {
    lips: upper + lowerBack,
    upperShade,
    lowerLight,
    cavity,
    teeth: teethBand,
    seam,
    seamOpacity: Math.max(0, 1 - Math.max(open * 3.2, teeth * 1.6)),
    cavityOpacity: Math.min(1, Math.max(open * 5, teeth * 0.8)),
    underShadow,
  };
}

/* ── Eyes ─────────────────────────────────────────────────────────────────── */

type EyeArt = {
  cx: number;
  cy: number;
  aperture: string;
  lidFill: string;
  lashLine: string;
  crease: string;
  lowerLine: string;
  cornerShade: string;
  closedTravel: number;
};

function buildEye(g: Geom, side: -1 | 1, gender: "male" | "female"): EyeArt {
  // side = -1 is the viewer's left eye, whose OUTER corner is the low-x end.
  const cx = g.midX + g.eyeGap * side;
  const cy = g.eyeY;
  const hw = g.eyeHalfW * (side === -1 ? 0.97 : 1);
  const upH = g.eyeUpper;
  const loH = g.eyeLower;

  const outerX = cx + hw * side;
  const outerY = cy - 1.4;
  const innerX = cx - hw * side;
  const innerY = cy + 2;

  const topArc =
    ` C ${n(innerX + hw * 0.5 * side)} ${n(cy - upH * 0.86)} ${n(outerX - hw * 0.52 * side)} ${n(cy - upH)} ${n(outerX)} ${n(outerY)}`;

  const aperture =
    `M ${n(innerX)} ${n(innerY)}` +
    topArc +
    ` C ${n(outerX - hw * 0.34 * side)} ${n(cy + loH * 0.82)} ${n(innerX + hw * 0.46 * side)} ${n(cy + loH * 0.76)} ${n(innerX)} ${n(innerY)} Z`;

  const top = cy - upH - 44;
  const lidFill =
    `M ${n(innerX)} ${n(innerY)}` + topArc + ` L ${n(outerX)} ${n(top)} L ${n(innerX)} ${n(top)} Z`;

  const lashLine = `M ${n(innerX)} ${n(innerY)}` + topArc;

  const creaseLift = gender === "female" ? 5.6 : 3.8;
  const crease =
    `M ${n(innerX + hw * 0.18 * side)} ${n(cy - upH * 0.72 - creaseLift)}` +
    ` C ${n(cx)} ${n(cy - upH - creaseLift * 1.15)} ${n(outerX - hw * 0.3 * side)} ${n(cy - upH - creaseLift * 0.7)} ${n(outerX + 1.5 * side)} ${n(cy - upH * 0.32 - creaseLift * 0.3)}`;

  const lowerLine =
    `M ${n(innerX + hw * 0.12 * side)} ${n(cy + loH + 1.4)}` +
    ` C ${n(cx)} ${n(cy + loH + 2.4)} ${n(outerX - hw * 0.35 * side)} ${n(cy + loH + 1.2)} ${n(outerX - hw * 0.05 * side)} ${n(cy + loH * 0.2)}`;

  const cornerShade =
    `M ${n(outerX)} ${n(outerY - 2)}` +
    ` C ${n(outerX + 5 * side)} ${n(cy + 2)} ${n(outerX + 3 * side)} ${n(cy + loH + 4)} ${n(outerX - hw * 0.25 * side)} ${n(cy + loH + 3)}` +
    ` C ${n(outerX - hw * 0.1 * side)} ${n(cy + loH * 0.4)} ${n(outerX - hw * 0.05 * side)} ${n(cy - 1)} ${n(outerX)} ${n(outerY - 2)} Z`;

  return {
    cx,
    cy,
    aperture,
    lidFill,
    lashLine,
    crease,
    lowerLine,
    cornerShade,
    closedTravel: upH + loH + 2.5,
  };
}

/* ── Head, hair, body ─────────────────────────────────────────────────────── */

function headPath(g: Geom): string {
  const {
    midX,
    crownY,
    templeY,
    cheekY,
    jawY,
    chinY,
    skullHalf,
    cheekHalf,
    jawHalf,
    chinHalf,
  } = g;
  const t = (a: number, b: number, k: number) => a + (b - a) * k;

  return [
    `M ${n(midX)} ${n(crownY)}`,
    `C ${n(midX + skullHalf * 0.6)} ${n(crownY)} ${n(midX + skullHalf)} ${n(t(crownY, templeY, 0.4))} ${n(midX + skullHalf)} ${n(templeY)}`,
    `C ${n(midX + skullHalf)} ${n(t(templeY, cheekY, 0.5))} ${n(midX + cheekHalf)} ${n(cheekY - 16)} ${n(midX + cheekHalf)} ${n(cheekY)}`,
    `C ${n(midX + cheekHalf)} ${n(t(cheekY, jawY, 0.5))} ${n(midX + jawHalf + 3)} ${n(jawY - 9)} ${n(midX + jawHalf)} ${n(jawY)}`,
    `C ${n(midX + jawHalf - 3)} ${n(t(jawY, chinY, 0.5))} ${n(midX + chinHalf + 12)} ${n(chinY - 7)} ${n(midX + chinHalf)} ${n(chinY)}`,
    `C ${n(midX + chinHalf * 0.5)} ${n(chinY + 2.6)} ${n(midX - chinHalf * 0.5)} ${n(chinY + 2.6)} ${n(midX - chinHalf)} ${n(chinY)}`,
    `C ${n(midX - chinHalf - 12)} ${n(chinY - 7)} ${n(midX - jawHalf + 3)} ${n(t(jawY, chinY, 0.5))} ${n(midX - jawHalf)} ${n(jawY)}`,
    `C ${n(midX - jawHalf - 3)} ${n(jawY - 9)} ${n(midX - cheekHalf)} ${n(t(cheekY, jawY, 0.5))} ${n(midX - cheekHalf)} ${n(cheekY)}`,
    `C ${n(midX - cheekHalf)} ${n(cheekY - 16)} ${n(midX - skullHalf)} ${n(t(templeY, cheekY, 0.5))} ${n(midX - skullHalf)} ${n(templeY)}`,
    `C ${n(midX - skullHalf)} ${n(t(crownY, templeY, 0.4))} ${n(midX - skullHalf * 0.6)} ${n(crownY)} ${n(midX)} ${n(crownY)}`,
    "Z",
  ].join(" ");
}

/** Just the lit edge: crown down the far side to the chin, drawn as a stroke. */
function rimPath(g: Geom): string {
  const { midX, crownY, templeY, cheekY, jawY, chinY, skullHalf, cheekHalf, jawHalf, chinHalf } = g;
  const t = (a: number, b: number, k: number) => a + (b - a) * k;
  return [
    `M ${n(midX + skullHalf * 0.36)} ${n(crownY + 3)}`,
    `C ${n(midX + skullHalf * 0.72)} ${n(crownY + 1)} ${n(midX + skullHalf)} ${n(t(crownY, templeY, 0.4))} ${n(midX + skullHalf)} ${n(templeY)}`,
    `C ${n(midX + skullHalf)} ${n(t(templeY, cheekY, 0.5))} ${n(midX + cheekHalf)} ${n(cheekY - 16)} ${n(midX + cheekHalf)} ${n(cheekY)}`,
    `C ${n(midX + cheekHalf)} ${n(t(cheekY, jawY, 0.5))} ${n(midX + jawHalf + 3)} ${n(jawY - 9)} ${n(midX + jawHalf)} ${n(jawY)}`,
    `C ${n(midX + jawHalf - 3)} ${n(t(jawY, chinY, 0.5))} ${n(midX + chinHalf + 12)} ${n(chinY - 7)} ${n(midX + chinHalf)} ${n(chinY)}`,
  ].join(" ");
}

/**
 * Ears run from the brow line to the base of the nose and they are ROUND at
 * the top. The first pass made them tall and pointed, which read as elf ears on
 * every persona whose hair did not cover them.
 */
function earPath(g: Geom, side: -1 | 1): string {
  const x = g.midX + (g.cheekHalf - 4) * side;
  const top = g.browY + 12;
  const bot = g.noseY - 4;
  const w = 7 * side;
  return (
    `M ${n(x)} ${n(top)}` +
    ` C ${n(x + w * 0.9)} ${n(top - 1)} ${n(x + w * 1.05)} ${n(top + 10)} ${n(x + w * 0.82)} ${n(bot - 12)}` +
    ` C ${n(x + w * 0.66)} ${n(bot - 2)} ${n(x + w * 0.3)} ${n(bot + 3)} ${n(x + w * 0.06)} ${n(bot)}` +
    ` C ${n(x - 1 * side)} ${n(bot - 6)} ${n(x - 1 * side)} ${n(top + 8)} ${n(x)} ${n(top)} Z`
  );
}

function earInner(g: Geom, side: -1 | 1): string {
  const x = g.midX + (g.cheekHalf + 1) * side;
  const top = g.browY + 11;
  const bot = g.noseY - 8;
  const w = 5 * side;
  return (
    `M ${n(x + w * 0.2)} ${n(top)}` +
    ` C ${n(x + w)} ${n(top + 3)} ${n(x + w * 0.9)} ${n(bot - 3)} ${n(x + w * 0.15)} ${n(bot)}`
  );
}

function neckPath(g: Geom): string {
  const { midX, neckHalf, neckTopY, shoulderY } = g;
  return (
    `M ${n(midX - neckHalf)} ${n(neckTopY)}` +
    ` C ${n(midX - neckHalf - 1)} ${n(neckTopY + 40)} ${n(midX - neckHalf - 8)} ${n(shoulderY - 24)} ${n(midX - neckHalf - 20)} ${n(shoulderY + 6)}` +
    ` L ${n(midX + neckHalf + 20)} ${n(shoulderY + 6)}` +
    ` C ${n(midX + neckHalf + 8)} ${n(shoulderY - 24)} ${n(midX + neckHalf + 1)} ${n(neckTopY + 40)} ${n(midX + neckHalf)} ${n(neckTopY)} Z`
  );
}

/** The shadow the jaw throws on the throat. Without it the head floats. */
function neckShadowPath(g: Geom): string {
  const { midX, neckHalf, chinY, jawHalf } = g;
  return (
    `M ${n(midX - neckHalf - 1)} ${n(chinY - 24)}` +
    ` C ${n(midX - jawHalf * 0.6)} ${n(chinY + 9)} ${n(midX + jawHalf * 0.6)} ${n(chinY + 9)} ${n(midX + neckHalf + 1)} ${n(chinY - 24)}` +
    ` L ${n(midX + neckHalf + 1)} ${n(chinY + 2)}` +
    ` C ${n(midX + jawHalf * 0.5)} ${n(chinY + 22)} ${n(midX - jawHalf * 0.5)} ${n(chinY + 22)} ${n(midX - neckHalf - 1)} ${n(chinY + 2)} Z`
  );
}

function garmentPath(g: Geom, gender: "male" | "female"): string {
  const { midX, shoulderY, shoulderHalf, neckHalf } = g;
  const drop = gender === "female" ? 16 : 13;
  return (
    `M ${n(midX - neckHalf - 6)} ${n(shoulderY - 30)}` +
    ` C ${n(midX - shoulderHalf * 0.62)} ${n(shoulderY - 22)} ${n(midX - shoulderHalf)} ${n(shoulderY + 6)} ${n(midX - shoulderHalf - 6)} ${n(shoulderY + 34)}` +
    ` L ${n(midX - shoulderHalf - 6)} 400` +
    ` L ${n(midX + shoulderHalf + 6)} 400` +
    ` L ${n(midX + shoulderHalf + 6)} ${n(shoulderY + 34)}` +
    ` C ${n(midX + shoulderHalf)} ${n(shoulderY + 6)} ${n(midX + shoulderHalf * 0.62)} ${n(shoulderY - 22)} ${n(midX + neckHalf + 6)} ${n(shoulderY - 30)}` +
    ` C ${n(midX + neckHalf * 0.7)} ${n(shoulderY - 30 + drop)} ${n(midX - neckHalf * 0.7)} ${n(shoulderY - 30 + drop)} ${n(midX - neckHalf - 6)} ${n(shoulderY - 30)} Z`
  );
}

/** The neckline, drawn a second time as a line so the garment has a seam. */
function collarPath(g: Geom, gender: "male" | "female"): string {
  const { midX, shoulderY, neckHalf } = g;
  const drop = gender === "female" ? 16 : 13;
  return (
    `M ${n(midX - neckHalf - 6)} ${n(shoulderY - 30)}` +
    ` C ${n(midX - neckHalf * 0.7)} ${n(shoulderY - 30 + drop)} ${n(midX + neckHalf * 0.7)} ${n(shoulderY - 30 + drop)} ${n(midX + neckHalf + 6)} ${n(shoulderY - 30)}`
  );
}

function shoulderRim(g: Geom): string {
  const { midX, shoulderY, shoulderHalf, neckHalf } = g;
  return (
    `M ${n(midX + neckHalf + 8)} ${n(shoulderY - 29)}` +
    ` C ${n(midX + shoulderHalf * 0.62)} ${n(shoulderY - 21)} ${n(midX + shoulderHalf)} ${n(shoulderY + 7)} ${n(midX + shoulderHalf + 6)} ${n(shoulderY + 34)}`
  );
}

/* ── Hair ─────────────────────────────────────────────────────────────────── */

type Hair = {
  back: string | null;
  front: string;
  sheen: string | null;
  /** Open stroke paths following the direction the hair actually falls. */
  strands: string;
};

/**
 * A lobed arc, swept anticlockwise from `a` to `b` radians. Curly hair is
 * defined by a BROKEN silhouette, so it is built from bumps rather than from
 * one smooth outline with texture painted on afterwards.
 */
function lobeArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a: number,
  b: number,
  count: number,
  bulge: number,
): string {
  let d = "";
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const ang = a + (b - a) * t;
    const wob = i % 2 === 0 ? 1 : 0.93;
    const x = cx + Math.cos(ang) * rx * wob;
    const y = cy - Math.sin(ang) * ry * wob;
    if (i === 0) {
      d += `M ${n(x)} ${n(y)}`;
    } else {
      const mid = a + (b - a) * (t - 0.5 / count);
      const bx = cx + Math.cos(mid) * rx * bulge;
      const by = cy - Math.sin(mid) * ry * bulge;
      d += ` Q ${n(bx)} ${n(by)} ${n(x)} ${n(y)}`;
    }
  }
  return d;
}

function buildHair(g: Geom, style: PersonaAppearance["hairStyle"]): Hair {
  const { midX, crownY, templeY, skullHalf, cheekHalf, cheekY, jawY, chinY } = g;
  const S = skullHalf;
  // The hairline sits about a fifth of the way down the face and dips at the
  // temples. Every style is cut from this same forehead edge, so no style ever
  // looks pasted onto a different head.
  const hairlineY = crownY + 34;
  const dipY = crownY + 52;
  const sbX = cheekHalf + 1;
  const sbY = g.eyeY - 2;

  /**
   * The forehead edge, travelling right to left, with the part sitting off
   * centre. Drawn once and reused so the six styles share a skull.
   */
  const hairline = (drop: number) =>
    ` C ${n(midX + S * 0.82)} ${n(hairlineY + 17 + drop)} ${n(midX + S * 0.46)} ${n(hairlineY + 5 + drop)} ${n(midX + S * 0.18)} ${n(hairlineY - 4 + drop)}` +
    ` C ${n(midX + S * 0.02)} ${n(hairlineY - 10 + drop)} ${n(midX - S * 0.18)} ${n(hairlineY - 8 + drop)} ${n(midX - S * 0.32)} ${n(hairlineY + 5 + drop)}` +
    ` C ${n(midX - S * 0.5)} ${n(hairlineY + 15 + drop)} ${n(midX - S * 0.64)} ${n(hairlineY + 13 + drop)} ${n(midX - S * 0.8)} ${n(dipY + 4 + drop)}`;

  /** Strokes that follow the fall of the hair. Four or five, never a hatch. */
  const sweepStrands = (spread: number, dropY: number) => {
    let d = "";
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x0 = midX - S * 0.62 + S * 1.24 * t;
      const y0 = crownY + 4 + Math.sin(t * Math.PI) * -5;
      const x1 = midX - S * 0.9 + S * 1.7 * t;
      const y1 = dropY + Math.sin(t * Math.PI) * spread;
      d += ` M ${n(x0)} ${n(y0)} C ${n(x0 - 6)} ${n(y0 + (y1 - y0) * 0.4)} ${n(x1 + 5)} ${n(y0 + (y1 - y0) * 0.7)} ${n(x1)} ${n(y1)}`;
    }
    return d.trim();
  };

  switch (style) {
    case "cropped": {
      const front =
        `M ${n(midX - sbX + 2)} ${n(sbY - 8)}` +
        ` C ${n(midX - S - 1)} ${n(templeY + 2)} ${n(midX - S - 3)} ${n(crownY + 24)} ${n(midX - S * 0.58)} ${n(crownY - 1)}` +
        ` C ${n(midX - S * 0.18)} ${n(crownY - 7)} ${n(midX + S * 0.28)} ${n(crownY - 7)} ${n(midX + S * 0.64)} ${n(crownY + 4)}` +
        ` C ${n(midX + S + 1)} ${n(crownY + 26)} ${n(midX + S + 1)} ${n(templeY + 4)} ${n(midX + sbX - 2)} ${n(sbY - 10)}` +
        ` C ${n(midX + sbX - 5)} ${n(sbY - 18)} ${n(midX + S - 7)} ${n(templeY + 14)} ${n(midX + S - 9)} ${n(templeY + 8)}` +
        hairline(4) +
        ` C ${n(midX - S + 5)} ${n(templeY + 6)} ${n(midX - sbX + 5)} ${n(sbY - 20)} ${n(midX - sbX + 2)} ${n(sbY - 8)} Z`;
      const sheen =
        `M ${n(midX - S * 0.46)} ${n(crownY + 13)}` +
        ` C ${n(midX - S * 0.12)} ${n(crownY + 1)} ${n(midX + S * 0.32)} ${n(crownY + 3)} ${n(midX + S * 0.58)} ${n(crownY + 20)}` +
        ` C ${n(midX + S * 0.3)} ${n(crownY + 14)} ${n(midX - S * 0.18)} ${n(crownY + 12)} ${n(midX - S * 0.46)} ${n(crownY + 13)} Z`;
      return { back: null, front, sheen, strands: sweepStrands(6, templeY + 14) };
    }

    case "wavy": {
      // Length to the jaw, and the silhouette has to actually undulate. A
      // smooth outline with texture painted inside reads as a bob, not a wave.
      const back =
        `M ${n(midX - S - 6)} ${n(templeY - 8)}` +
        ` C ${n(midX - S - 24)} ${n(cheekY - 26)} ${n(midX - S - 11)} ${n(cheekY + 4)} ${n(midX - S - 22)} ${n(jawY + 2)}` +
        ` C ${n(midX - S - 28)} ${n(chinY - 8)} ${n(midX - S - 13)} ${n(chinY + 6)} ${n(midX - S - 10)} ${n(chinY + 18)}` +
        ` C ${n(midX - S * 0.4)} ${n(chinY + 26)} ${n(midX + S * 0.4)} ${n(chinY + 26)} ${n(midX + S + 10)} ${n(chinY + 18)}` +
        ` C ${n(midX + S + 13)} ${n(chinY + 6)} ${n(midX + S + 28)} ${n(chinY - 8)} ${n(midX + S + 22)} ${n(jawY + 2)}` +
        ` C ${n(midX + S + 11)} ${n(cheekY + 4)} ${n(midX + S + 24)} ${n(cheekY - 26)} ${n(midX + S + 6)} ${n(templeY - 8)} Z`;
      const front =
        `M ${n(midX - S - 7)} ${n(templeY + 20)}` +
        ` C ${n(midX - S - 11)} ${n(crownY + 20)} ${n(midX - S * 0.62)} ${n(crownY - 12)} ${n(midX + 6)} ${n(crownY - 12)}` +
        ` C ${n(midX + S * 0.76)} ${n(crownY - 12)} ${n(midX + S + 11)} ${n(crownY + 18)} ${n(midX + S + 7)} ${n(templeY + 22)}` +
        ` C ${n(midX + S + 2)} ${n(templeY + 8)} ${n(midX + S - 3)} ${n(templeY + 2)} ${n(midX + S - 7)} ${n(templeY + 12)}` +
        hairline(2) +
        ` C ${n(midX - S + 1)} ${n(templeY + 4)} ${n(midX - S - 4)} ${n(templeY - 2)} ${n(midX - S - 7)} ${n(templeY + 20)} Z`;
      const sheen =
        `M ${n(midX - S * 0.56)} ${n(crownY + 15)}` +
        ` C ${n(midX - S * 0.2)} ${n(crownY - 2)} ${n(midX + S * 0.36)} ${n(crownY - 1)} ${n(midX + S * 0.66)} ${n(crownY + 21)}` +
        ` C ${n(midX + S * 0.3)} ${n(crownY + 14)} ${n(midX - S * 0.24)} ${n(crownY + 13)} ${n(midX - S * 0.56)} ${n(crownY + 15)} Z`;
      const strands =
        sweepStrands(16, cheekY + 6) +
        ` M ${n(midX - S - 10)} ${n(cheekY - 6)} C ${n(midX - S - 20)} ${n(cheekY + 14)} ${n(midX - S - 8)} ${n(jawY + 8)} ${n(midX - S - 16)} ${n(chinY + 8)}` +
        ` M ${n(midX + S + 10)} ${n(cheekY - 6)} C ${n(midX + S + 20)} ${n(cheekY + 14)} ${n(midX + S + 8)} ${n(jawY + 8)} ${n(midX + S + 16)} ${n(chinY + 8)}`;
      return { back, front, sheen, strands };
    }

    case "long": {
      const back =
        `M ${n(midX - S - 8)} ${n(templeY - 12)}` +
        ` C ${n(midX - S - 30)} ${n(cheekY - 10)} ${n(midX - S - 18)} ${n(chinY + 4)} ${n(midX - S - 30)} ${n(chinY + 52)}` +
        ` C ${n(midX - S - 36)} ${n(chinY + 84)} ${n(midX - S - 26)} 386 ${n(midX - S - 24)} 400` +
        ` L ${n(midX + S + 24)} 400` +
        ` C ${n(midX + S + 26)} 386 ${n(midX + S + 36)} ${n(chinY + 84)} ${n(midX + S + 30)} ${n(chinY + 52)}` +
        ` C ${n(midX + S + 18)} ${n(chinY + 4)} ${n(midX + S + 30)} ${n(cheekY - 10)} ${n(midX + S + 8)} ${n(templeY - 12)} Z`;
      const front =
        `M ${n(midX - S - 9)} ${n(templeY + 28)}` +
        ` C ${n(midX - S - 12)} ${n(crownY + 18)} ${n(midX - S * 0.6)} ${n(crownY - 13)} ${n(midX + 8)} ${n(crownY - 13)}` +
        ` C ${n(midX + S * 0.78)} ${n(crownY - 13)} ${n(midX + S + 12)} ${n(crownY + 16)} ${n(midX + S + 9)} ${n(templeY + 30)}` +
        ` C ${n(midX + S + 4)} ${n(templeY + 12)} ${n(midX + S - 2)} ${n(templeY + 2)} ${n(midX + S - 6)} ${n(templeY + 14)}` +
        hairline(0) +
        ` C ${n(midX - S + 2)} ${n(templeY + 6)} ${n(midX - S - 5)} ${n(templeY)} ${n(midX - S - 9)} ${n(templeY + 28)} Z`;
      const sheen =
        `M ${n(midX - S * 0.6)} ${n(crownY + 16)}` +
        ` C ${n(midX - S * 0.22)} ${n(crownY - 3)} ${n(midX + S * 0.38)} ${n(crownY - 2)} ${n(midX + S * 0.7)} ${n(crownY + 21)}` +
        ` C ${n(midX + S * 0.32)} ${n(crownY + 13)} ${n(midX - S * 0.26)} ${n(crownY + 14)} ${n(midX - S * 0.6)} ${n(crownY + 16)} Z`;
      const strands =
        sweepStrands(14, cheekY) +
        ` M ${n(midX - S - 12)} ${n(cheekY + 10)} C ${n(midX - S - 24)} ${n(chinY + 20)} ${n(midX - S - 14)} ${n(chinY + 60)} ${n(midX - S - 24)} 396` +
        ` M ${n(midX + S + 12)} ${n(cheekY + 10)} C ${n(midX + S + 24)} ${n(chinY + 20)} ${n(midX + S + 14)} ${n(chinY + 60)} ${n(midX + S + 24)} 396` +
        ` M ${n(midX + S + 2)} ${n(chinY + 30)} C ${n(midX + S + 8)} ${n(chinY + 60)} ${n(midX + S + 2)} ${n(chinY + 90)} ${n(midX + S + 8)} 396`;
      return { back, front, sheen, strands };
    }

    case "tied": {
      // Swept back into a knot that sits BEHIND the crown, so the silhouette is
      // asymmetric the way a real tied-back head is. The first pass parked the
      // knot beside the ear and it read as a pair of earmuffs.
      const bunX = midX + S * 0.72;
      const bunY = templeY - 20;
      const back =
        lobeArc(bunX, bunY, 21, 20, Math.PI * 1.15, -Math.PI * 0.35, 7, 1.2) +
        ` C ${n(bunX - 6)} ${n(bunY + 24)} ${n(bunX - 22)} ${n(bunY + 18)} ${n(bunX - 26)} ${n(bunY + 2)} Z`;
      const front =
        `M ${n(midX - S - 1)} ${n(templeY + 20)}` +
        ` C ${n(midX - S - 3)} ${n(crownY + 20)} ${n(midX - S * 0.6)} ${n(crownY - 6)} ${n(midX + 6)} ${n(crownY - 7)}` +
        ` C ${n(midX + S * 0.74)} ${n(crownY - 8)} ${n(midX + S + 4)} ${n(crownY + 20)} ${n(midX + S + 2)} ${n(templeY + 22)}` +
        ` C ${n(midX + S - 1)} ${n(templeY + 6)} ${n(midX + S - 4)} ${n(templeY)} ${n(midX + S - 6)} ${n(templeY + 14)}` +
        hairline(-2) +
        ` C ${n(midX - S + 2)} ${n(templeY)} ${n(midX - S + 1)} ${n(templeY - 2)} ${n(midX - S - 1)} ${n(templeY + 20)} Z`;
      const sheen =
        `M ${n(midX - S * 0.5)} ${n(crownY + 12)}` +
        ` C ${n(midX - S * 0.16)} ${n(crownY - 1)} ${n(midX + S * 0.34)} ${n(crownY)} ${n(midX + S * 0.62)} ${n(crownY + 18)}` +
        ` C ${n(midX + S * 0.3)} ${n(crownY + 12)} ${n(midX - S * 0.2)} ${n(crownY + 11)} ${n(midX - S * 0.5)} ${n(crownY + 12)} Z`;
      // Two strands escaping at the temple: the detail that stops "tied back"
      // from reading as a swim cap.
      const strands =
        sweepStrands(4, templeY + 6) +
        ` M ${n(midX - S * 0.86)} ${n(dipY + 2)} C ${n(midX - S - 4)} ${n(templeY + 22)} ${n(midX - S - 2)} ${n(cheekY - 14)} ${n(midX - S - 6)} ${n(cheekY + 4)}` +
        ` M ${n(midX + S * 0.9)} ${n(dipY + 6)} C ${n(midX + S + 2)} ${n(templeY + 26)} ${n(midX + S + 1)} ${n(cheekY - 16)} ${n(midX + S + 4)} ${n(cheekY - 2)}`;
      return { back, front, sheen, strands };
    }

    case "curly": {
      const cyh = crownY + 34;
      const back =
        lobeArc(midX, cyh, S + 17, 56, Math.PI * 1.04, -Math.PI * 0.04, 11, 1.26) +
        ` L ${n(midX + S + 15)} ${n(cheekY + 2)} L ${n(midX - S - 15)} ${n(cheekY + 2)} Z`;
      // The forehead edge is lobed too. A smooth cap over a bumpy outline is
      // the thing that made the first pass look like a tiara.
      const front =
        lobeArc(midX, cyh, S + 8, 48, Math.PI * 0.98, -Math.PI * 0.02, 9, 1.22) +
        ` C ${n(midX + S * 0.8)} ${n(hairlineY + 14)} ${n(midX + S * 0.5)} ${n(hairlineY + 2)} ${n(midX + S * 0.22)} ${n(hairlineY - 1)}` +
        ` C ${n(midX + S * 0.04)} ${n(hairlineY - 4)} ${n(midX - S * 0.1)} ${n(hairlineY - 3)} ${n(midX - S * 0.24)} ${n(hairlineY + 3)}` +
        ` C ${n(midX - S * 0.46)} ${n(hairlineY + 11)} ${n(midX - S * 0.62)} ${n(hairlineY + 13)} ${n(midX - S * 0.82)} ${n(dipY + 6)} Z`;
      // Coils, drawn as small arcs rather than as a texture fill.
      let strands = "";
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const ang = Math.PI * (0.94 - t * 0.88);
        const rx = S - 6;
        const ry = 34;
        const x = midX + Math.cos(ang) * rx;
        const y = cyh - Math.sin(ang) * ry;
        strands += ` M ${n(x - 5)} ${n(y)} A 5 4.6 0 1 1 ${n(x + 5)} ${n(y + 1)}`;
      }
      return { back, front, sheen: null, strands: strands.trim() };
    }

    case "short":
    default: {
      const front =
        `M ${n(midX - sbX)} ${n(sbY)}` +
        ` C ${n(midX - S - 3)} ${n(templeY + 4)} ${n(midX - S - 5)} ${n(crownY + 22)} ${n(midX - S * 0.6)} ${n(crownY - 5)}` +
        ` C ${n(midX - S * 0.2)} ${n(crownY - 13)} ${n(midX + S * 0.3)} ${n(crownY - 13)} ${n(midX + S * 0.66)} ${n(crownY + 2)}` +
        ` C ${n(midX + S + 3)} ${n(crownY + 24)} ${n(midX + S + 3)} ${n(templeY + 6)} ${n(midX + sbX)} ${n(sbY - 4)}` +
        ` C ${n(midX + sbX - 3)} ${n(sbY - 14)} ${n(midX + S - 5)} ${n(templeY + 16)} ${n(midX + S - 7)} ${n(templeY + 10)}` +
        hairline(0) +
        ` C ${n(midX - S + 2)} ${n(templeY + 8)} ${n(midX - sbX + 3)} ${n(sbY - 16)} ${n(midX - sbX)} ${n(sbY)} Z`;
      const sheen =
        `M ${n(midX - S * 0.46)} ${n(crownY + 11)}` +
        ` C ${n(midX - S * 0.1)} ${n(crownY - 3)} ${n(midX + S * 0.36)} ${n(crownY - 1)} ${n(midX + S * 0.64)} ${n(crownY + 18)}` +
        ` C ${n(midX + S * 0.32)} ${n(crownY + 11)} ${n(midX - S * 0.16)} ${n(crownY + 9)} ${n(midX - S * 0.46)} ${n(crownY + 11)} Z`;
      return { back: null, front, sheen, strands: sweepStrands(8, templeY + 16) };
    }
  }
}

/* ── Facial hair, brows, nose ─────────────────────────────────────────────── */

/**
 * A brow is blunt at the nose end, arches over the middle of the eye, and
 * tapers to a point at the temple. The earlier version closed the shape at a
 * single inner point, which folded the outline back on itself and printed a
 * small arrowhead beside the nose on every face.
 */
function browPath(g: Geom, side: -1 | 1): string {
  const cx = g.midX + g.eyeGap * side;
  // The two brows are never the same. One sits a touch higher and arches more,
  // which is the single cheapest thing that stops a face reading as a decal.
  const cy = g.browY + (side === -1 ? 0.7 : -0.7);
  const hw = g.browHalf * (side === -1 ? 0.96 : 1);
  const t = g.browThick;
  const arch = g.browArch * (side === -1 ? 1 : 1.12);
  const inner = cx - hw * side;
  const outer = cx + hw * side;
  const peak = cx + hw * 0.22 * side;

  // The return curve has to stay strictly BELOW the top curve for the whole
  // sweep. When it does not, the outline folds through itself and prints a
  // small dark arrowhead beside the nose, which is what shipped twice.
  return (
    `M ${n(inner)} ${n(cy - t * 0.2)}` +
    ` C ${n(cx - hw * 0.5 * side)} ${n(cy - arch - t * 0.34)} ${n(peak - hw * 0.06 * side)} ${n(cy - arch - t * 0.24)} ${n(outer)} ${n(cy + arch * 0.34)}` +
    ` C ${n(peak)} ${n(cy - arch * 0.3 + t * 0.86)} ${n(cx - hw * 0.42 * side)} ${n(cy - arch * 0.1 + t * 0.98)} ${n(inner - 1.2 * side)} ${n(cy + t * 0.72)}` +
    ` Z`
  );
}

function nosePaths(g: Geom) {
  const { midX, browY, eyeY, noseY, noseHalf } = g;
  const shade =
    `M ${n(midX + 3.5)} ${n(browY + 8)}` +
    ` C ${n(midX + 7)} ${n(eyeY + 8)} ${n(midX + 8.5)} ${n(noseY - 20)} ${n(midX + noseHalf * 0.82)} ${n(noseY - 5)}` +
    ` C ${n(midX + noseHalf * 0.5)} ${n(noseY + 3.5)} ${n(midX - noseHalf * 0.42)} ${n(noseY + 3.5)} ${n(midX - noseHalf * 0.66)} ${n(noseY - 4)}` +
    ` C ${n(midX - 2)} ${n(noseY - 14)} ${n(midX - 0.5)} ${n(eyeY + 10)} ${n(midX + 3.5)} ${n(browY + 8)} Z`;

  const nostril = (side: -1 | 1) => {
    const x = midX + noseHalf * 0.62 * side;
    return (
      `M ${n(x - 2.6 * side)} ${n(noseY - 2.6)}` +
      ` C ${n(x + 0.4 * side)} ${n(noseY - 4.2)} ${n(x + 2.4 * side)} ${n(noseY - 2.4)} ${n(x + 2.2 * side)} ${n(noseY - 0.2)}` +
      ` C ${n(x + 1.2 * side)} ${n(noseY + 1)} ${n(x - 1.6 * side)} ${n(noseY + 0.4)} ${n(x - 2.6 * side)} ${n(noseY - 2.6)} Z`
    );
  };

  const tipLight =
    `M ${n(midX - 4.5)} ${n(noseY - 9)}` +
    ` C ${n(midX - 1)} ${n(noseY - 13)} ${n(midX + 3)} ${n(noseY - 11)} ${n(midX + 3.2)} ${n(noseY - 7)}` +
    ` C ${n(midX + 1)} ${n(noseY - 4.4)} ${n(midX - 4)} ${n(noseY - 5.6)} ${n(midX - 4.5)} ${n(noseY - 9)} Z`;

  const under =
    `M ${n(midX - noseHalf - 1)} ${n(noseY + 1)}` +
    ` C ${n(midX - noseHalf * 0.4)} ${n(noseY + 6.5)} ${n(midX + noseHalf * 0.4)} ${n(noseY + 6.5)} ${n(midX + noseHalf + 1)} ${n(noseY + 1)}` +
    ` C ${n(midX + noseHalf * 0.4)} ${n(noseY + 3)} ${n(midX - noseHalf * 0.4)} ${n(noseY + 3)} ${n(midX - noseHalf - 1)} ${n(noseY + 1)} Z`;

  return { shade, nostrilL: nostril(-1), nostrilR: nostril(1), tipLight, under };
}

function beardPath(g: Geom, full: boolean): string {
  const { midX, cheekHalf, cheekY, jawHalf, jawY, chinY, noseY, chinHalf } = g;
  const top = full ? cheekY - 6 : cheekY + 6;
  return (
    `M ${n(midX - cheekHalf + 2)} ${n(top)}` +
    ` C ${n(midX - cheekHalf + 4)} ${n(jawY)} ${n(midX - jawHalf * 0.5)} ${n(chinY + 4)} ${n(midX)} ${n(chinY + 4)}` +
    ` C ${n(midX + jawHalf * 0.5)} ${n(chinY + 4)} ${n(midX + cheekHalf - 4)} ${n(jawY)} ${n(midX + cheekHalf - 2)} ${n(top)}` +
    ` C ${n(midX + cheekHalf * 0.5)} ${n(noseY + 16)} ${n(midX + chinHalf)} ${n(noseY + 10)} ${n(midX)} ${n(noseY + 12)}` +
    ` C ${n(midX - chinHalf)} ${n(noseY + 10)} ${n(midX - cheekHalf * 0.5)} ${n(noseY + 16)} ${n(midX - cheekHalf + 2)} ${n(top)} Z`
  );
}

function moustachePath(g: Geom): string {
  const { midX, noseY, mouthHalf } = g;
  const y = noseY + 9;
  return (
    `M ${n(midX - mouthHalf - 3)} ${n(y + 4)}` +
    ` C ${n(midX - mouthHalf * 0.6)} ${n(y - 4)} ${n(midX - 2)} ${n(y - 2)} ${n(midX)} ${n(y + 1)}` +
    ` C ${n(midX + 2)} ${n(y - 2)} ${n(midX + mouthHalf * 0.6)} ${n(y - 4)} ${n(midX + mouthHalf + 3)} ${n(y + 4)}` +
    ` C ${n(midX + mouthHalf * 0.5)} ${n(y + 8)} ${n(midX - mouthHalf * 0.5)} ${n(y + 8)} ${n(midX - mouthHalf - 3)} ${n(y + 4)} Z`
  );
}

function glassesPaths(g: Geom) {
  const { midX, eyeGap, eyeY } = g;
  const w = 25;
  const h = 20;
  const lens = (side: -1 | 1) => {
    const cx = midX + eyeGap * side;
    return `M ${n(cx - w / 2)} ${n(eyeY - h / 2 + 5)} q 0 -5 5 -5 h ${n(w - 10)} q 5 0 5 5 v ${n(h - 10)} q 0 5 -5 5 h ${n(-(w - 10))} q -5 0 -5 -5 Z`;
  };
  return {
    lensL: lens(-1),
    lensR: lens(1),
    bridge: `M ${n(midX - eyeGap + w / 2)} ${n(eyeY - 3)} C ${n(midX - 5)} ${n(eyeY - 6)} ${n(midX + 5)} ${n(eyeY - 6)} ${n(midX + eyeGap - w / 2)} ${n(eyeY - 3)}`,
    templeL: `M ${n(midX - eyeGap - w / 2)} ${n(eyeY - 4)} L ${n(midX - g.cheekHalf - 2)} ${n(eyeY - 7)}`,
    templeR: `M ${n(midX + eyeGap + w / 2)} ${n(eyeY - 4)} L ${n(midX + g.cheekHalf + 2)} ${n(eyeY - 7)}`,
  };
}

/* ── The whole portrait ───────────────────────────────────────────────────── */

export type PortraitRig = {
  svg: string;
  geom: Geom;
  palette: Palette;
  eyeTravel: { left: number; right: number };
};

const VIEWBOX = "0 0 320 400";

/**
 * The head sits a couple of degrees off vertical, pivoting near the base of the
 * neck. A perfectly upright, perfectly symmetric head is the single loudest
 * signal that nobody drew this. The rig composes its drift on top of this.
 */
export const BASE_TILT = -2.2;

/**
 * Builds the complete SVG. Every element the rig animates carries an id built
 * from `uid`, so two portraits can coexist without their clip paths and
 * gradients colliding.
 */
export function buildPortrait(persona: Persona, uid: string): PortraitRig {
  const g = buildGeom(persona.gender);
  const p = buildPalette(persona.appearance, persona.gender);
  const a = persona.appearance;
  const female = persona.gender === "female";
  const eyeL = buildEye(g, -1, persona.gender);
  const eyeR = buildEye(g, 1, persona.gender);
  const hair = buildHair(g, a.hairStyle);
  const nose = nosePaths(g);
  const head = headPath(g);
  const mouth = mouthPaths(g, { open: 0, wide: 0, round: 0, teeth: 0 });
  const glasses = a.glasses ? glassesPaths(g) : null;
  const id = (k: string) => `${uid}-${k}`;

  const eye = (e: typeof eyeL, key: string) => `
    <g>
      <path d="${e.cornerShade}" fill="${p.skinDeep}" opacity="0.18"/>
      <g clip-path="url(#${id(`clip-${key}`)})">
        <path d="${e.aperture}" fill="${p.sclera}"/>
        <path d="${e.aperture}" fill="${p.skinDeep}" opacity="0.24" transform="translate(0,-4.5)"/>
        <g id="${id(`gaze-${key}`)}">
          <circle cx="${n(e.cx)}" cy="${n(e.cy + 0.4)}" r="${n(g.irisR)}" fill="${p.iris}"/>
          <circle cx="${n(e.cx)}" cy="${n(e.cy + 1.7)}" r="${n(g.irisR * 0.84)}" fill="${p.irisLit}" opacity="0.55"/>
          <circle cx="${n(e.cx)}" cy="${n(e.cy + 0.4)}" r="${n(g.irisR)}" fill="none" stroke="${shade(p.iris, -0.5)}" stroke-width="1.2"/>
          <circle cx="${n(e.cx)}" cy="${n(e.cy + 0.6)}" r="${n(g.pupilR)}" fill="#140F0C"/>
          <circle cx="${n(e.cx - g.irisR * 0.44)}" cy="${n(e.cy - g.irisR * 0.44)}" r="1.8" fill="#FFFFFF" opacity="0.92"/>
          <circle cx="${n(e.cx + g.irisR * 0.32)}" cy="${n(e.cy + g.irisR * 0.42)}" r="0.9" fill="#FFFFFF" opacity="0.3"/>
        </g>
        <g id="${id(`lid-${key}`)}">
          <path d="${e.lidFill}" fill="${p.skinShade}"/>
          <path d="${e.lashLine}" fill="none" stroke="${p.ink}" stroke-width="${female ? 2.6 : 2.2}" stroke-linecap="round"/>
        </g>
      </g>
      <path d="${e.crease}" fill="none" stroke="${p.ink}" stroke-width="1.15" stroke-linecap="round" opacity="0.4"/>
      <path d="${e.lowerLine}" fill="none" stroke="${p.ink}" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
    </g>`;

  // Line work, and the discipline here is RESTRAINT. The pass before this one
  // drew the wing of the nose and the fold down to the mouth as well, and at
  // portrait scale they read as a crack and a scar. One short line under the
  // ball of the nose is all the structure the drawing actually needs.
  const lines =
    `M ${n(g.midX - g.noseHalf * 0.5)} ${n(g.noseY - 3.6)}` +
    ` C ${n(g.midX - g.noseHalf * 0.28)} ${n(g.noseY + 1.4)} ${n(g.midX + g.noseHalf * 0.28)} ${n(g.noseY + 1.4)} ${n(g.midX + g.noseHalf * 0.5)} ${n(g.noseY - 3.6)}`;

  const svg = `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" role="img" aria-label="${esc(persona.name)}, forward deployed engineer" style="display:block;width:100%;height:100%">
  <defs>
    <radialGradient id="${id("ground")}" cx="50%" cy="32%" r="64%">
      <stop offset="0%" stop-color="#282320"/>
      <stop offset="100%" stop-color="#121110"/>
    </radialGradient>
    <radialGradient id="${id("face")}" cx="33%" cy="24%" r="80%">
      <stop offset="0%" stop-color="${p.skinLit}"/>
      <stop offset="48%" stop-color="${p.skin}"/>
      <stop offset="100%" stop-color="${p.skinShade}"/>
    </radialGradient>
    <linearGradient id="${id("hair")}" x1="16%" y1="0%" x2="88%" y2="100%">
      <stop offset="0%" stop-color="${p.hairLit}"/>
      <stop offset="44%" stop-color="${p.hair}"/>
      <stop offset="100%" stop-color="${p.hairShade}"/>
    </linearGradient>
    <linearGradient id="${id("garment")}" x1="10%" y1="0%" x2="94%" y2="100%">
      <stop offset="0%" stop-color="${p.garmentLit}"/>
      <stop offset="56%" stop-color="${p.garment}"/>
      <stop offset="100%" stop-color="${p.garmentShade}"/>
    </linearGradient>
    <filter id="${id("soft")}" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3.4"/>
    </filter>
    <filter id="${id("softer")}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
    <filter id="${id("edge")}" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="1.6"/>
    </filter>
    <filter id="${id("grain")}" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <clipPath id="${id("clip-l")}"><path d="${eyeL.aperture}"/></clipPath>
    <clipPath id="${id("clip-r")}"><path d="${eyeR.aperture}"/></clipPath>
    <clipPath id="${id("clip-head")}"><path d="${head}"/></clipPath>
    ${hair.back ? `<clipPath id="${id("clip-hair-back")}"><path d="${hair.back}"/></clipPath>` : ""}
    <clipPath id="${id("clip-hair-front")}"><path d="${hair.front}"/></clipPath>
    <clipPath id="${id("clip-cavity")}"><path id="${id("cavity-clip-path")}" d="${mouth.cavity}"/></clipPath>
  </defs>

  <rect x="0" y="0" width="320" height="400" fill="url(#${id("ground")})"/>

  <g id="${id("body")}">
    <path d="${neckPath(g)}" fill="${p.skinShade}"/>
    <path d="${neckShadowPath(g)}" fill="${p.skinDeep}" opacity="0.62" filter="url(#${id("soft")})"/>
    <path d="${garmentPath(g, persona.gender)}" fill="url(#${id("garment")})"/>
    <path d="${collarPath(g, persona.gender)}" fill="none" stroke="${shade(p.garment, -0.45)}" stroke-width="1.7" stroke-linecap="round" opacity="0.75"/>
    <path d="${shoulderRim(g)}" fill="none" stroke="${p.rim}" stroke-width="2.6" opacity="0.18" filter="url(#${id("soft")})"/>
  </g>

  <g id="${id("head")}" transform="rotate(${BASE_TILT} ${n(g.midX)} 360)">
    ${
      hair.back
        ? `<path d="${hair.back}" fill="url(#${id("hair")})"/>
    <g clip-path="url(#${id("clip-hair-back")})">
      <rect x="${n(g.midX)}" y="0" width="200" height="400" fill="${p.hairShade}" opacity="0.5" filter="url(#${id("softer")})"/>
      <path d="${hair.strands}" fill="none" stroke="${p.hairLit}" stroke-width="1.1" stroke-linecap="round" opacity="0.24"/>
      <path d="${hair.strands}" fill="none" stroke="${p.hairShade}" stroke-width="1.2" stroke-linecap="round" opacity="0.34" transform="translate(3.5,1)"/>
    </g>`
        : ""
    }

    <g id="${id("jaw")}">
      <path d="${head}" fill="url(#${id("face")})"/>
      <g clip-path="url(#${id("clip-head")})">
        <path d="${head}" fill="none" stroke="${p.skinDeep}" stroke-width="14" opacity="0.12" filter="url(#${id("soft")})"/>
        <path d="${rimPath(g)}" fill="none" stroke="${p.rim}" stroke-width="3.6" opacity="0.32" filter="url(#${id("edge")})"/>
        <!-- the hair casts on the forehead, which is what stops it reading as a decal -->
        <path d="${hair.front}" fill="${p.skinDeep}" opacity="0.3" filter="url(#${id("soft")})" transform="translate(0,5)"/>
        <!-- cheekbone plane, shadow side -->
        <path d="M ${n(g.midX + g.cheekHalf - 6)} ${n(g.cheekY - 24)} C ${n(g.midX + 26)} ${n(g.cheekY - 6)} ${n(g.midX + 20)} ${n(g.cheekY + 16)} ${n(g.midX + 30)} ${n(g.cheekY + 28)} C ${n(g.midX + g.cheekHalf - 10)} ${n(g.cheekY + 22)} ${n(g.midX + g.cheekHalf - 2)} ${n(g.cheekY - 2)} ${n(g.midX + g.cheekHalf - 6)} ${n(g.cheekY - 24)} Z" fill="${p.skinDeep}" opacity="0.2" filter="url(#${id("soft")})"/>
        <!-- temple plane, light side, kept much softer -->
        <path d="M ${n(g.midX - g.cheekHalf + 4)} ${n(g.cheekY - 22)} C ${n(g.midX - 28)} ${n(g.cheekY - 4)} ${n(g.midX - 22)} ${n(g.cheekY + 14)} ${n(g.midX - 30)} ${n(g.cheekY + 26)} C ${n(g.midX - g.cheekHalf + 8)} ${n(g.cheekY + 20)} ${n(g.midX - g.cheekHalf)} ${n(g.cheekY - 2)} ${n(g.midX - g.cheekHalf + 4)} ${n(g.cheekY - 22)} Z" fill="${p.skinDeep}" opacity="0.09" filter="url(#${id("soft")})"/>
        <!-- brow ridge shadow, heavier on a male build -->
        <path d="M ${n(g.midX - g.cheekHalf + 8)} ${n(g.browY + 3)} C ${n(g.midX - 20)} ${n(g.browY + 15)} ${n(g.midX + 20)} ${n(g.browY + 15)} ${n(g.midX + g.cheekHalf - 8)} ${n(g.browY + 3)} L ${n(g.midX + g.cheekHalf - 8)} ${n(g.browY - 12)} L ${n(g.midX - g.cheekHalf + 8)} ${n(g.browY - 12)} Z" fill="${p.skinDeep}" opacity="${female ? 0.08 : 0.15}" filter="url(#${id("softer")})"/>
        <!-- warmth across the cheeks and the tip of the nose -->
        <ellipse cx="${n(g.midX - g.eyeGap - 4)}" cy="${n(g.cheekY - 4)}" rx="17" ry="10" fill="#B4553F" opacity="${female ? 0.13 : 0.05}" filter="url(#${id("softer")})"/>
        <ellipse cx="${n(g.midX + g.eyeGap + 4)}" cy="${n(g.cheekY - 4)}" rx="17" ry="10" fill="#B4553F" opacity="${female ? 0.11 : 0.045}" filter="url(#${id("softer")})"/>
        <ellipse cx="${n(g.midX)}" cy="${n(g.noseY - 5)}" rx="9" ry="6" fill="#B4553F" opacity="0.1" filter="url(#${id("softer")})"/>
        <!-- chin plane -->
        <ellipse cx="${n(g.midX + 1)}" cy="${n(g.chinY - 13)}" rx="${n(g.chinHalf + 5)}" ry="9" fill="${p.skinLit}" opacity="0.3" filter="url(#${id("soft")})"/>
        <path d="M ${n(g.midX - g.jawHalf * 0.7)} ${n(g.chinY - 6)} C ${n(g.midX - g.chinHalf)} ${n(g.chinY + 6)} ${n(g.midX + g.chinHalf)} ${n(g.chinY + 6)} ${n(g.midX + g.jawHalf * 0.7)} ${n(g.chinY - 6)} L ${n(g.midX + g.jawHalf * 0.8)} ${n(g.chinY + 8)} L ${n(g.midX - g.jawHalf * 0.8)} ${n(g.chinY + 8)} Z" fill="${p.skinDeep}" opacity="0.24" filter="url(#${id("soft")})"/>
      </g>

      <path d="${nose.shade}" fill="${p.skinDeep}" opacity="0.17" filter="url(#${id("soft")})"/>
      <path d="${nose.tipLight}" fill="${p.skinLit}" opacity="0.42" filter="url(#${id("soft")})"/>
      <path d="${nose.under}" fill="${p.skinDeep}" opacity="0.24" filter="url(#${id("soft")})"/>
      <path d="${lines}" fill="none" stroke="${p.ink}" stroke-width="1.2" stroke-linecap="round" opacity="0.28"/>
      <path d="${nose.nostrilL}" fill="${p.ink}" opacity="0.5"/>
      <path d="${nose.nostrilR}" fill="${p.ink}" opacity="0.55"/>

      ${
        a.facialHair === "stubble"
          ? `<g clip-path="url(#${id("clip-head")})"><path d="${beardPath(g, false)}" fill="${p.hair}" opacity="0.15" filter="url(#${id("soft")})"/></g>`
          : ""
      }
      ${
        a.facialHair === "beard"
          ? `<path d="${beardPath(g, true)}" fill="url(#${id("hair")})"/>
             <path d="${beardPath(g, true)}" fill="${p.hairShade}" opacity="0.45" filter="url(#${id("soft")})" transform="translate(0,3)"/>`
          : ""
      }

      <g id="${id("mouth")}">
        <path id="${id("mouth-under")}" d="${mouth.underShadow}" fill="${p.skinDeep}" opacity="0.26" filter="url(#${id("soft")})"/>
        <path id="${id("mouth-lips")}" d="${mouth.lips}" fill="${p.lip}"/>
        <path id="${id("mouth-cavity")}" d="${mouth.cavity}" fill="${p.cavity}" opacity="${n(mouth.cavityOpacity)}"/>
        <g clip-path="url(#${id("clip-cavity")})">
          <path id="${id("mouth-teeth")}" d="${mouth.teeth}" fill="${p.teeth}" opacity="0"/>
        </g>
        <path id="${id("mouth-upper")}" d="${mouth.upperShade}" fill="${p.lipShade}" opacity="0.5"/>
        <path id="${id("mouth-light")}" d="${mouth.lowerLight}" fill="#FFFFFF" opacity="0.22" filter="url(#${id("soft")})"/>
        <path id="${id("mouth-seam")}" d="${mouth.seam}" fill="none" stroke="${p.ink}" stroke-width="1.5" stroke-linecap="round" opacity="${n(mouth.seamOpacity * 0.75)}"/>
      </g>

      ${a.facialHair === "beard" ? `<path d="${moustachePath(g)}" fill="url(#${id("hair")})"/>` : ""}
    </g>

    <!-- Ears are modelled, not stamped. Flat skin fill made them read as two
         pale slabs bolted to the head; they take the shadow tone with a lit
         upper edge, which is what puts them behind the plane of the face. -->
    <path d="${earPath(g, -1)}" fill="${p.skinShade}"/>
    <path d="${earPath(g, -1)}" fill="${p.skinDeep}" opacity="0.35" filter="url(#${id("soft")})" transform="translate(-2,3)"/>
    <path d="${earPath(g, 1)}" fill="${p.skinShade}"/>
    <path d="${earPath(g, 1)}" fill="${p.skinDeep}" opacity="0.4" filter="url(#${id("soft")})" transform="translate(2,3)"/>
    <path d="${earInner(g, -1)}" fill="none" stroke="${p.ink}" stroke-width="1.3" opacity="0.36"/>
    <path d="${earInner(g, 1)}" fill="none" stroke="${p.ink}" stroke-width="1.3" opacity="0.4"/>

    ${eye(eyeL, "l")}
    ${eye(eyeR, "r")}

    <g id="${id("brows")}">
      <path d="${browPath(g, -1)}" fill="${mix(p.hair, p.skin, 0.14)}" opacity="0.94"/>
      <path d="${browPath(g, 1)}" fill="${mix(p.hair, p.skin, 0.1)}"/>
    </g>

    <path d="${hair.front}" fill="url(#${id("hair")})"/>
    <!-- Strands, the shadow side of the hair mass and the sheen all live inside
         this clip. Without it the strand strokes run straight down the face,
         which is exactly what the first version of them did. -->
    <g clip-path="url(#${id("clip-hair-front")})">
      <rect x="${n(g.midX + 6)}" y="0" width="200" height="400" fill="${p.hairShade}" opacity="0.5" filter="url(#${id("softer")})"/>
      ${hair.sheen ? `<path d="${hair.sheen}" fill="${p.rim}" opacity="0.18" filter="url(#${id("soft")})"/>` : ""}
      <path d="${hair.strands}" fill="none" stroke="${p.hairLit}" stroke-width="1.1" stroke-linecap="round" opacity="0.26"/>
      <path d="${hair.strands}" fill="none" stroke="${p.hairShade}" stroke-width="1.2" stroke-linecap="round" opacity="0.34" transform="translate(3.5,1)"/>
    </g>

    ${
      glasses
        ? `<g opacity="0.94">
             <path d="${glasses.lensL}" fill="#FFFFFF" opacity="0.05"/>
             <path d="${glasses.lensR}" fill="#FFFFFF" opacity="0.05"/>
             <path d="${glasses.templeL}" fill="none" stroke="${p.frame}" stroke-width="1.8" stroke-linecap="round"/>
             <path d="${glasses.templeR}" fill="none" stroke="${p.frame}" stroke-width="1.8" stroke-linecap="round"/>
             <path d="${glasses.lensL}" fill="none" stroke="${p.frame}" stroke-width="2.1"/>
             <path d="${glasses.lensR}" fill="none" stroke="${p.frame}" stroke-width="2.1"/>
             <path d="${glasses.bridge}" fill="none" stroke="${p.frame}" stroke-width="2.1" stroke-linecap="round"/>
           </g>`
        : ""
    }
  </g>

  <!-- Print grain. Static, outside every animated group, and the single
       cheapest thing that stops flat vector fills reading as clip art. -->
  <rect x="0" y="0" width="320" height="400" filter="url(#${id("grain")})" opacity="0.1" style="mix-blend-mode:overlay" pointer-events="none"/>
</svg>`;

  return {
    svg,
    geom: g,
    palette: p,
    eyeTravel: { left: eyeL.closedTravel, right: eyeR.closedTravel },
  };
}
