import type { Metadata } from "next";

import { PageShell } from "@/components/PageShell";
import { getSiteUrl } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Next Build ideas board",
  description: "Suggest what we build next, and upvote the ideas you want.",
};

export const viewport = { colorScheme: "light dark" } as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg font-sans text-text antialiased">
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
