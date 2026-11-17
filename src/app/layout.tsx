import type { Metadata } from "next";
import localFont from "next/font/local";

import { PageShell } from "@/components/PageShell";
import { getSiteUrl } from "@/lib/env";

import "./globals.css";

const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Next Build ideas board",
  description: "Suggest what we build next, and upvote the ideas you want.",
};

export const viewport = { colorScheme: "light dark" } as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-bg font-sans text-text antialiased">
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
