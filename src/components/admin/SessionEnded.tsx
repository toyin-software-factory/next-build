"use client";

import { ErrorMessage } from "@/components/ErrorMessage";
import { COPY } from "@/lib/copy";

/** Shown when an admin action is refused or throws: the sign in ended, so the only way on is a reload. */
export function SessionEnded() {
  return (
    <div className="flex flex-col items-start gap-3">
      <ErrorMessage message={COPY.adminSessionEnded} />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          window.location.reload();
        }}
      >
        {COPY.reload}
      </button>
    </div>
  );
}
