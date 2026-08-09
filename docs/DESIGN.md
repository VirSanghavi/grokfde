# Grok FDE — Design Contract

Single source of truth. Every surface obeys this. If something here conflicts with
existing code, this document wins and the code changes.

The product is a **person who shows up**: Atlas, a forward-deployed engineer, live in
chat, on a video call, in Slack, and inside your repo. The design must feel like
precision engineering documentation that a human wrote, not an AI SaaS template.

## Reference aesthetic

Editorial-technical. Think a well-set engineering journal crossed with a broadcast
control room. Stark ink on paper, generous measure, tabular data, one live signal
color. Never a dashboard-shaped pile of cards.

## Non-negotiable bans

These appear nowhere in this codebase:

- Purple / indigo / violet / blue-to-purple gradients. No gradient buttons, no
  gradient text, no gradient borders, no glow orbs, no aurora, no blobs.
- `bg-indigo-*`, `bg-blue-500`, `bg-violet-*`, bare Tailwind palette colors as brand.
- Sparkles icons, emoji as UI icons, "AI-powered" badges, "✨ Now with AI" pills.
- `animate-pulse` throbbing dots, infinite bounce/ping/spin as decoration.
- Hover `scale-105` on cards, typewriter text, number count-up, confetti, parallax.
- Glassmorphism as a default surface. Backdrop blur is allowed on exactly one thing:
  the sticky marketing nav over video.
- Cards-in-cards. Maximum ONE bordered container deep. Most groupings are whitespace
  plus a hairline rule, not a box.
- The canonical AI landing skeleton (pill → centered hero → logo strip → 3 equal
  feature cards → stat band → testimonials → pricing → FAQ → CTA band).
- Invented statistics. No "10,000+ users", no "99.9% uptime", no fake testimonials,
  no fake customer logos. If we cannot source it, it does not ship.
- Em dashes in any user-facing copy. Use commas, periods, or restructure.
- Placeholder leakage: no lorem ipsum, no `href="#"`, no "Your Company", no
  `undefined`/`NaN` rendering, no example.com addresses.

## Color

Warm-neutral paper and ink, with a single vermilion reserved for LIVE state. The
accent is semantic, not decorative: it means "this is happening right now" (agent
speaking, call active, recording). Because it only ever marks live state, it never
competes with itself.

Tokens live in `src/styles/globals.css` under `@theme`. Never hardcode a hex in a
component. Never use a raw Tailwind palette color for brand meaning.

```
--color-paper        #FBFAF9   page ground, slightly warm, never pure white
--color-surface      #FFFFFF   raised surfaces, inputs, cards
--color-sunken       #F4F2EF   wells, inset areas, code blocks
--color-hover        #F0EEEB
--color-active       #E8E5E1

--color-ink          #13110F   primary text, warm near-black, never #000
--color-ink-2        #3D3833   secondary text
--color-ink-3        #6B645C   muted text, labels
--color-ink-4        #9A928A   faint, timestamps, disabled

--color-rule         #E5E1DC   hairlines and borders
--color-rule-strong  #D2CCC5   emphasized borders, input outlines

--color-live         #D6401F   LIVE ONLY: speaking, recording, active call
--color-live-soft    rgba(214,64,31,0.08)
--color-live-rule    rgba(214,64,31,0.22)

--color-positive     #15803D   success, ready, resolved
--color-caution      #A16207   warnings, pending
--color-critical     #B42318   errors, blockers, destructive
```

Measured against paper, not assumed. An earlier version of this document claimed all
of these cleared 4.5:1; that claim was false and two of them failed:

```
ink       18.07:1   ink-2  11.12:1   ink-3  5.59:1   ink-4  4.66:1 (was 2.94, fixed)
positive   4.81:1   caution 4.72:1   critical 6.31:1
live       4.37:1   FAILS for small text, see below
```

`--color-ink-4` is now `#787069`. The old `#9A928A` was 2.94:1 and unreadable as text,
which is exactly what shipped on the homepage step numerals.

`--color-live` at 4.37:1 is the one deliberate exception. It stays because it is the
brand's live signal and it is only ever used as a FILL (a status dot, a recording
indicator, a solid button background) or as large text at 24px and above, where the
3:1 large-text threshold applies. It must never be used for small body text on paper.
If you need live-colored small text, use ink and pair it with a live dot.

Status is ALWAYS color plus a text label or icon, never color alone.

Dark surfaces are permitted in exactly two places, both of which are earned because
the content is video: the marketing hero/footer film, and the live call stage. Those
use `--color-stage` (#0E0D0C) and white text. Everywhere else in the product is
light. There is no theme toggle and no dark mode variant to maintain.

## Typography

**Keep the site's existing main font. Do not change it.** The product ships on Geist,
the user likes it, and an earlier version of this document was wrong to swap it out.
Geist Sans is the UI face everywhere; Geist Mono is for genuine machine data only
(timestamps, durations, counts in a column, IDs, code, diffs).

One typeface still holds as a rule: differences between surfaces come from size and
weight, never from a different family. There is no third font.

The reference for how type should FEEL is the Leaki hero: a very large, tight,
left-aligned display headline sitting low in the frame, set in the same family as the
body, with a short subhead directly beneath it. Weight and scale do the work.

Scale (one scale, reused everywhere, no per-section invention):

```
display-xl   clamp(2.75rem, 6vw, 4.5rem)   600  tracking -0.035em  leading 0.96
display-l    clamp(2rem, 4vw, 3rem)        600  tracking -0.03em   leading 1.02
display-m    clamp(1.5rem, 2.6vw, 2rem)    600  tracking -0.025em  leading 1.1
title        1.0625rem                     600  tracking -0.02em
body-l       1rem                          400  leading 1.6
body         0.9375rem                     400  leading 1.55
caption      0.8125rem                     400  leading 1.45   ink-3
label        0.6875rem  MONO  500  tracking 0.08em  uppercase   ink-3
```

Rules: body copy is left-aligned and capped at 68ch. Headlines use
`text-wrap: balance`. Never center a paragraph longer than two lines. Mono for every
number that sits in a column or ticks (durations, counts, times) with
`font-variant-numeric: tabular-nums`. Sentence case for all UI labels; the `label`
tier is the only uppercase and it is used sparingly, never more than once per view.
Body text is never below 16px on mobile.

## Width: use the whole screen

The app is a workspace, not a blog. On a laptop it fills the display edge to edge.

- No centered narrow column. There is no 1120px content well, and `.page-frame` is
  not a max-width container. Application surfaces span the full viewport width with
  generous side padding: 20px at mobile, 32px at tablet, 48px at desktop.
- Long-form prose still caps at 68ch for readability, but the LAYOUT around it is
  full width. Cap the paragraph, never the page.
- Wide surfaces earn the space with real structure: a full-bleed table, a two or three
  column split, a rail beside a main region. If widening a layout only stretches
  whitespace, the layout is wrong, not the width.
- The one exception is a genuinely single-focus moment, such as the booking confirmation
  or a short auth form, where a centered measure is the correct composition.

## No pills, no floating boxes

The single most vibe-coded thing in this codebase is content sitting inside a rounded
box for no reason, and text wearing a `rounded-full` pill.

- **No `rounded-full` capsules. Anywhere.** The mechanical rule: `rounded-full` is
  permitted ONLY on an element that is a perfect circle (equal width and height).
  That means avatars, status dots, and spinner rings. An avatar showing initials is
  still an avatar and is allowed; the earlier "and contains no text" clause was too
  literal and flagged them. What stays banned is a capsule around a WORD: a status,
  a badge, a chip, a tag, a button.
- **Alpha scrims over video are not gradients.** The gradient ban targets decorative
  color. A black or stage-colored alpha ramp laid over the hero film so white text
  stays legible is a legibility tool and is permitted, on the two earned dark
  surfaces only. Decorative color gradients remain banned everywhere.
- **Buttons are rounded rectangles at 8px**, matching the Leaki reference. Not
  capsules, not sharp corners. Soft, deliberate, consistent.
- **Every badge, chip, tag, status label, and step indicator** is either plain text
  with a hairline or a colored dot beside it, or an 8px rectangle. A status like
  "Blocked" is a word, optionally preceded by a dot. It is never a capsule.
- Uppercase is not a substitute for a shape. `BLOCKED` in a red capsule is two tells in
  one: the pill and the shouty all-caps. Write "Blocked" in sentence case.
- Decorative nesting is still banned: no wrapping a heading and a paragraph in a
  bordered, shadowed box, and never a box inside a box. A container earns itself by
  being independently scrollable, actionable, or genuinely floating above the page.
  The floating hero nav and the hero tagline in the reference are legitimate: they
  float above full-bleed imagery, which is exactly what a container is for.
- **No decorative cards.** Do not wrap a heading and a paragraph in a bordered,
  shadowed box. Group with whitespace and a single hairline rule. A container must earn
  itself by being independently scrollable, independently actionable, or genuinely
  elevated above the page.
- **Never a box inside a box.** One bordered container deep, maximum, and most surfaces
  are zero deep.
- Suggested prompts, filters, and chips are plain text buttons on a hairline row or a
  simple list, not a scatter of floating capsules.

## One typeface

Geist Sans is the only UI face in the product. Every heading, label, button, input,
and paragraph uses it, at the weights in the type scale above. The user explicitly
asked that the site's main font not be changed, and an earlier version of this
document wrongly told the team to replace it. Geist stays.

Geist Mono appears only where the content is genuinely machine data: timestamps,
durations, counts in a column, IDs, code, and diffs. It is never used for prose, never
for headings, and never as decoration.

There is no third font anywhere. If a surface looks different from its neighbour, the
cause is size and weight, never a different family.

## Space, shape, elevation

## The marketing hero: match the reference

The user supplied a reference (Leaki) and wants the marketing surface to feel like it.
An earlier version of this document told the team to delete the cinematic hero image.
That was wrong and is reversed here. The reference composition, to match:

- **Full-bleed cinematic imagery** filling the viewport behind the hero. Not a
  decorative texture, not a gradient, not an abstract blob: a real, high-quality,
  wide cinematic frame. It must be rock steady. Motion, if any, is one extremely slow
  drift, and a perfectly still frame is better than a shaky one.
- **A floating nav** inset from the top edge, on a translucent dark surface with a
  soft blur, ~16px radius, spanning most of the width. Wordmark left, a few links
  centered, one solid light CTA button right. This is the ONE place backdrop blur is
  correct, because it floats over imagery.
- **The headline sits LOW in the frame**, bottom-left, very large, tight tracking,
  left-aligned, white, two lines, ending in a period. Beneath it a two-line subhead at
  much smaller size, then the two buttons.
- **Two buttons side by side**: primary solid light with dark text, secondary a
  translucent dark surface with light text. Both 8px radius, comfortable padding.
- **A short tagline anchored bottom-right**, in a translucent container, reading as a
  quiet three-word summary of the product.
- Text over imagery always sits on enough scrim to stay readable. Verify contrast
  against the actual pixels behind it, not against an assumed average.

Below the hero the page returns to paper and ink. The cinematic treatment is the hero
and the footer moment, not the whole site.

## Everything is interactive

Every component on the site responds to the person using it. A static rectangle that
looks clickable and does nothing is the worst thing we can ship.

- Every control has a real hover, a visible focus-visible ring, and an active pressed
  state. Nothing is decorative-looking-but-dead.
- Cards, rows, and list items that lead somewhere show it on hover and are reachable
  by keyboard.
- Real-time surfaces genuinely update: streaming text arrives token by token, live
  status reflects actual state, tool calls appear as they happen.
- Inputs respond immediately, never waiting on a round trip to acknowledge a keystroke.
- Any action that changes data updates optimistically and reconciles, so nothing feels
  laggy.
- If a control cannot do something real, it is removed, not disabled and left as
  scenery.

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96. Nothing between.
- Radii mapped by role: `8px` for buttons, inputs, and all small controls; `12px` for
  panels and surfaces that genuinely need a container; `16px` for the floating hero
  nav and hero tagline; `999px` ONLY for avatars and status dots. Never a
  `rounded-full` capsule around text.
- Elevation is a three-step system and most things are step 0:
  - 0 — flat on paper, separated by a hairline rule. This is the default.
  - 1 — `0 1px 2px rgba(19,17,15,0.05)` for surfaces that sit above paper.
  - 2 — `0 16px 40px rgba(19,17,15,0.10)` for things that genuinely float:
    modals, popovers, the command palette.
  Shadows are neutral and imply one light source from above. No colored shadows.
- Vertical rhythm is modulated, not uniform. Sections do not all get the same
  padding. One element per viewport is dominant.

## Motion

Motion communicates state change or it does not exist.

- Durations: 120ms for control feedback, 200ms for surfaces entering, 320ms max.
- Easing: `cubic-bezier(0.32, 0.72, 0, 1)`.
- Transition named properties only. Never `transition-all`.
- Allowed: press feedback (`active:scale-[0.99]`), focus ring, surface enter/exit,
  the audio-driven mouth and waveform on a live call, streaming text arriving.
- Every non-essential animation is gated behind `prefers-reduced-motion`.
- The ONE signature moment in the product is the live call stage coming alive when
  Atlas starts speaking. Nothing else competes with it.

## Components

- One primary action per view. Primary is solid ink on paper. Secondary is a
  hairline outline. Tertiary is text only. Never show all variants in one view.
- Every interactive element has resting, hover, focus-visible, active, disabled, and
  where relevant loading and error states. Disabled is not opacity alone; it also
  loses its border emphasis and shows `cursor-not-allowed`.
- Focus-visible is a 2px `--color-ink` ring at 2px offset. It is never removed.
- Icon-only buttons always carry `aria-label` and a tooltip.
- Inputs: 44px minimum height, real `<label>` elements above the field, helper and
  error text slots reserved so nothing shifts when an error appears.
- Tables: hairline row separators, hover state, numerics right-aligned in mono.
- Use the existing custom `DottedIcon` set. One stroke width. Fixed size scale
  (14 / 16 / 20). No mixing filled and outline.

## The four states, always

Every data surface ships all four. This is the difference between a demo and a
product, and it is the most common thing missing.

1. **Loading** — a skeleton shaped like the real content. Never a bare spinner,
   never a blank screen.
2. **Empty** — says what this surface is, why it is empty, and gives the single
   action that fills it. Never a blank panel.
3. **Error** — a human sentence explaining what failed and a retry control. Never a
   raw error object, never a silent failure, never an unhandled rejection reaching
   the console.
4. **Loaded** — the real thing, with real data.

## Mobile

Mobile-first. Every surface is built at 375px before it is built at 1440px.

- No horizontal scroll at any width from 320px up. Wide content scrolls inside its
  own container.
- Tap targets minimum 44x44px, from 360px width up. One documented exception, which
  is geometry rather than sloppiness: a 7 column calendar cannot reach 44px cells at
  320px viewport width. Seven 44px cells is 308px, and the card border plus any grid
  gap exceeds 320 before a single pixel of padding. At 320 the booking day cells are
  38.6x44 with zero overflow, which is the best that geometry allows. Reaching 44
  there would mean abandoning a 7 day week. Measured, not assumed.
- Grids stack (`grid-cols-1`) then expand. Nothing squishes.
- Dialogs are `max-h-[90dvh]` and scroll internally.
- Padding scales down. Desktop `p-16` becomes mobile `p-20`-equivalent, never the
  same value at both.
- The booking flow and the call are the two surfaces most likely to be used on a
  phone in an office lobby. They must be flawless there.

## Accessibility

- 4.5:1 minimum on every text and background pair. Verified, not assumed.
- Semantic heading order, one `h1` per page.
- Native `button` and `a`. Never a `div` with `onClick`.
- Modals trap focus, close on Escape, and restore focus to the trigger.
- Every image has descriptive `alt`, or `aria-hidden` if decorative.
- All motion respects `prefers-reduced-motion`.

## Copy

### Never narrate the demo

This is a real product, not an exhibit. The site must never talk about itself as a
demo, explain its own methodology, or instruct the visitor like a museum placard.
Banned outright:

- The words "demo", "this page", "try it", "here you can", "open one of these".
- Meta-commentary about our own honesty ("there is no scripted transcript here").
- Section headings written as instructions to the visitor ("Ask it something", "Say it
  out loud"). Headings name capabilities, not actions the visitor should perform.
- Raw route paths or URLs shown as calls to action (`/fde/grok-fde`,
  `/book/grok-fde?call=1`). A link says what happens: "Talk to the engineer",
  "Book a call". Query strings never appear in visible copy.
- Implementation details that undersell us ("has read three documents"). Never expose
  the size of the knowledge base, the fixture count, or anything else that reveals
  this was assembled quickly.

The way to prove the product is not a real thing is to show it working. A live prompt
box wired to the real agent proves more than any sentence claiming the demo is real,
and it never once has to use the word.

Concrete and specific. We lead with the claim we can actually demonstrate, because
the product is running right there on the same page.

- No buzzwords: empower, seamless, effortless, unlock, elevate, revolutionize,
  leverage, supercharge, harness, cutting-edge, world-class.
- CTAs state the action and its outcome: "Book a demo", "Talk to Atlas now",
  "Open the call". Never "Get Started" or "Learn More".
- One canonical product name: **Grok FDE**. The agent is **Atlas**.
- No em dashes. Vary sentence length. Take a position.
- Every number on screen is real, computed from actual data, or it is not shown.
