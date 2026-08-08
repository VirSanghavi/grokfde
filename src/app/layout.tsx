import { ToastProvider } from "@/components/ui/Toast";
import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "@/styles/globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Grok FDE — Every prospect gets an engineer",
  description:
    "Train Grok on your company once. Let every customer talk to a technical engineer instantly across chat, email, voice, and Slack.",
  icons: {
    icon: "/brand/logo.svg",
    apple: "/brand/logo.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`light ${sans.variable} ${mono.variable}`}>
      <body className={sans.className}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
