"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";

import { setHidden } from "@/app/admin/actions";
import { announce } from "@/lib/announce";
import { COPY } from "@/lib/copy";

import { ErrorMessage } from "../ErrorMessage";
import { SessionEnded } from "./SessionEnded";

type RowError = { kind: "ended" } | { kind: "failed"; want: boolean };

/**
 * Hide or Unhide for one idea. It sends the state wanted (so a retry is safe), shows the new label
 * at once, and settles on the server's answer when the page refreshes. A refused or thrown call
 * means the sign in ended; any other failure shows a row error with Try again. Focus stays here.
 */
export function HideButton({
  ideaId,
  hidden,
  describedBy,
}: {
  ideaId: string;
  hidden: boolean;
  describedBy: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic<boolean, boolean>(hidden, (_current, want) => want);
  const [error, setError] = useState<RowError | null>(null);
  const inFlight = useRef(false);
  const button = useRef<HTMLButtonElement>(null);

  const send = (want: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      setShown(want);
      try {
        const result = await setHidden({ ideaId, hidden: want });
        if (result.ok) {
          announce(want ? COPY.adminHidden : COPY.adminShown);
          router.refresh();
        } else if (result.code === "forbidden") {
          setError({ kind: "ended" });
        } else {
          setError({ kind: "failed", want });
          // The idea may be gone or the state unknown: show what is really stored.
          setTimeout(() => {
            router.refresh();
          }, 0);
        }
      } catch {
        // Access answers an ended session with a redirect fetch cannot follow, so it throws.
        setError({ kind: "ended" });
      } finally {
        inFlight.current = false;
        button.current?.focus();
      }
    });
  };

  const failedMessage = (want: boolean) => (want ? COPY.adminHideFailed : COPY.adminShowFailed);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="btn btn-secondary"
        aria-label={shown ? COPY.adminUnhideName : COPY.adminHideName}
        aria-describedby={describedBy}
        aria-disabled={isPending ? "true" : undefined}
        onClick={() => {
          send(!shown);
        }}
      >
        {shown ? COPY.adminUnhide : COPY.adminHide}
      </button>
      {error?.kind === "ended" ? (
        <div className="mt-2 basis-full">
          <SessionEnded />
        </div>
      ) : null}
      {error?.kind === "failed" ? (
        <div className="mt-2 basis-full">
          <ErrorMessage
            message={failedMessage(error.want)}
            onRetry={() => {
              send(error.want);
            }}
          />
        </div>
      ) : null}
    </>
  );
}
