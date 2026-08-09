import { ToastProvider } from "@/components/ui/Toast";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/styles/globals.css";

/*
 * Geist, as the product shipped. One family for the whole UI; the mono face is
 * for genuine machine data only (timestamps, durations, counts in a column,
 * IDs, code, diffs). Both are variable, so the type scale can reach for any
 * weight without loading another file.
 */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const description =
  "Atlas is a forward-deployed engineer that answers your prospects in chat, on a call, over email, and in Slack. Train it on your docs and repo once, then let it run technical evaluations end to end.";

/*
 * No `icons` and no `openGraph.images` here on purpose. Those are supplied by
 * the file conventions in this directory (icon.svg, apple-icon.png,
 * opengraph-image.png, twitter-image.png with their .alt.txt files). Declaring
 * them again would emit duplicate tags and override the generated hashes.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://grokfde.com"),
  title: {
    default: "Grok FDE",
    template: "%s | Grok FDE",
  },
  description,
  applicationName: "Grok FDE",
  openGraph: {
    type: "website",
    siteName: "Grok FDE",
    title: "Grok FDE",
    description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Grok FDE",
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#FBFAF9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
