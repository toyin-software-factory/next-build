"use client";

import { ErrorMessage } from "@/components/ErrorMessage";

export const SESSION_ENDED_TEXT =
  "Your admin sign in has ended. Reload this page to sign in again.";

/** Shown when an admin action is refused or throws: the sign in ended, so the only way on is a reload. */
export function SessionEnded() {
  return (
    <div className="flex flex-col items-start gap-3">
      <ErrorMessage message={SESSION_ENDED_TEXT} />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          window.location.reload();
        }}
      >
        Reload
      </button>
    </div>
  );
}
