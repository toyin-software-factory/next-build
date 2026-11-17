"use client";

import { COPY } from "@/lib/copy";

import { LightbulbIcon } from "./icons";

/** Shown when the board is empty. Its one button moves focus to the idea field. */
export function EmptyState() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong p-8 text-center">
      <LightbulbIcon className="size-8 text-muted" />
      <h2 className="text-lg font-semibold">{COPY.emptyHeading}</h2>
      <p className="text-muted">{COPY.emptyBody}</p>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          document.getElementById("idea-field")?.focus();
        }}
      >
        {COPY.emptyStateAction}
      </button>
    </section>
  );
}
