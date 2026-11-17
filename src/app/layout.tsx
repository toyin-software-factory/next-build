import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Next Build",
  description: "Suggest what we build next, and upvote the ideas you want.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white font-sans text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
