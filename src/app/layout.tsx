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

const TITLE = "Next Build: suggest and vote on what we build next";
const DESCRIPTION =
  "One page where anyone suggests what to build next in 140 characters and upvotes the ideas they want. No sign up.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Next Build",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
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
