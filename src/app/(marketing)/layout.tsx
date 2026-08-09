import type { ReactNode } from "react";

/**
 * Marketing is paper and ink like the rest of the product. Dark is earned in
 * exactly two places, the hero film and the footer film, and both paint their
 * own ground.
 *
 * `marketing-root` has to stay: it is the hook globals.css uses to hand document
 * scrolling back to the page (the ops shell locks it). The same rule also paints
 * html and body with --color-stage, and this file does not own globals.css. It
 * is harmless in practice because the page opens and closes on film, so the only
 * thing that colour ever reaches is the overscroll gutter above the hero and
 * below the footer, where dark is the right answer anyway.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-root min-h-dvh overflow-x-hidden bg-paper text-ink antialiased">
      {children}
    </div>
  );
}
