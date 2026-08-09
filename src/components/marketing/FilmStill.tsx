import { cn } from "@/lib/utils";

type Props = {
  /** Path under /public. Both stills are 1280x720. */
  src: string;
  /**
   * Hero scrims the bottom so a headline sits on it. Footer washes the whole
   * frame and lands on solid stage so the film merges into the footer below it.
   */
  scrim: "hero" | "footer";
  /** True only for the hero, which is the LCP element. */
  eager?: boolean;
  className?: string;
};

/**
 * The full-bleed still behind the two dark surfaces the contract allows.
 *
 * There is no video path here on purpose. `hero.mp4` and `footer.mp4` shake, and
 * the shake is baked into the encode rather than added by CSS, so no amount of
 * transform tuning fixes them. They are not referenced anywhere any more.
 *
 * The only motion is a single horizontal pan: constant scale, constant velocity,
 * no Y drift, no zoom pulse. It reuses the `marketing-pan-x` keyframes already in
 * globals.css, which travel 3.2% each way at a fixed scale(1.08). That file also
 * carries the `prefers-reduced-motion` rule that pins `.marketing-pan` to a still
 * frame, so the reduced-motion gate comes with the class name.
 */
export function FilmStill({ src, scrim, eager = false, className }: Props) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-stage", className)}>
      {/*
        The wrapper overhangs the frame by 6% and the keyframes scale it another
        4% per side, so the 3.2% travel never exposes an edge. The overscan also
        crops the lens matte baked into the top corners of hero-still.jpg.
      */}
      <div className="marketing-pan absolute inset-[-6%] animate-[marketing-pan-x_96s_linear_infinite_alternate]">
        {/*
          Deliberately a plain img, not next/image. The sources are only 1280
          wide, so optimisation cannot add detail, and `images.qualities` is left
          at the Next 16 default of [75], which would re-encode the one image the
          whole page rests on. Serving the original JPEG keeps it intact.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      {/*
        Three scrims, each doing a job rather than decorating. The weights are
        the lightest that still clear WCAG on the brightest pixel behind each
        text run, measured against the rendered page rather than guessed, so the
        city stays visible instead of being flattened into a black bar.
      */}

      {/* Holds the sky back so it never blows out under white text. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          scrim === "hero" ? "bg-stage/20" : "bg-stage/42",
        )}
      />

      {/* Keeps the nav legible over the brightest part of the frame. */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-stage/55 from-0% to-transparent to-22%" />

      {/* The ground the headline actually sits on. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-linear-to-t from-stage from-0%",
          scrim === "hero"
            ? "via-stage/62 via-24% to-transparent to-60%"
            : "via-stage/66 via-30% to-transparent to-76%",
        )}
      />
    </div>
  );
}
