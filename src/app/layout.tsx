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
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%2310B981'/><circle cx='10' cy='10' r='1.4' fill='%23ecfdf5' opacity='.9'/><circle cx='16' cy='10' r='1.4' fill='%23ecfdf5' opacity='.7'/><circle cx='22' cy='10' r='1.4' fill='%23ecfdf5' opacity='.5'/><circle cx='10' cy='16' r='1.4' fill='%23ecfdf5' opacity='.7'/><circle cx='16' cy='16' r='1.4' fill='%23ecfdf5' opacity='.95'/><circle cx='22' cy='16' r='1.4' fill='%23ecfdf5' opacity='.7'/><circle cx='10' cy='22' r='1.4' fill='%23ecfdf5' opacity='.5'/><circle cx='16' cy='22' r='1.4' fill='%23ecfdf5' opacity='.7'/><circle cx='22' cy='22' r='1.4' fill='%23ecfdf5' opacity='.4'/></svg>",
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
