import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grok FDE",
  description: "Every prospect gets an engineer.",
};

/** Minimal root layout so API routes can run without Person A's UI. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
