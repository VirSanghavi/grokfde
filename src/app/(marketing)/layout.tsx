import type { ReactNode } from "react";

/**
 * Marketing routes use their own full-bleed cinematic chrome.
 * Allow document scroll (company shell locks body overflow).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-root min-h-dvh overflow-x-hidden bg-black text-white antialiased">
      {children}
    </div>
  );
}
