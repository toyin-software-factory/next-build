import type { ReactNode } from "react";

import { COPY } from "@/lib/copy";

/** Skip link, header, main landmark and the one polite status region (present before any text is set). */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-control border border-border-strong bg-surface px-4 py-3 text-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10"
      >
        {COPY.skipLink}
      </a>
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl leading-8 font-semibold sm:text-3xl sm:leading-9">
            {COPY.productName}
          </h1>
          <p className="mt-1 text-muted">{COPY.purpose}</p>
        </header>
        <main id="main">{children}</main>
        <p id="status" role="status" className="sr-only" />
      </div>
    </>
  );
}
