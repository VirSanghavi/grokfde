import { ToastProvider } from "@/components/ui/Toast";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
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
