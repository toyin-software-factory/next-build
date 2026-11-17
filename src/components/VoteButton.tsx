"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";

import { setVote } from "@/app/actions";
import { announce } from "@/lib/announce";
import { COPY, VOTE_ERROR_COPY } from "@/lib/copy";
import { readVoteResult, type VoteErrorCode } from "@/lib/schemas";

import { ErrorMessage } from "./ErrorMessage";
import { ArrowUpIcon, ArrowUpFilledIcon } from "./icons";

type Want = "on" | "off";
type Shown = { voted: boolean; count: number };
type RowError = { code: Exclude<VoteErrorCode, "idea_unavailable">; want: Want };

/** After the idea is gone the row disappears, so focus goes to the board heading, or the form when the board empties. */
function moveFocusAfterRemoval(): void {
  const heading = document.getElementById("ideas-heading");
  const rows = heading?.closest("section")?.querySelectorAll("li").length ?? 0;
  (rows > 1 ? heading : document.getElementById("idea-field"))?.focus();
}

/**
 * The vote button for one idea. It sends the state the visitor wants (the opposite of what is
 * shown), shows the new count at once, and settles on the server's answer when the board refreshes.
 * Failures show in the row with a Try again button and are not announced twice.
 */
export function VoteButton({
  ideaId,
  count,
  voted,
}: {
  ideaId: string;
  count: number;
  voted: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic<Shown, Want>({ voted, count }, (current, want) => {
    // Already in the wanted state (a retry after a lost answer): nothing to add or take.
    if (current.voted === (want === "on")) return current;
    return want === "on"
      ? { voted: true, count: current.count + 1 }
      : { voted: false, count: Math.max(0, current.count - 1) };
  });
  const [error, setError] = useState<RowError | null>(null);
  const inFlight = useRef(false);
  const button = useRef<HTMLButtonElement>(null);

  const send = (want: Want, refocus: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      setShown(want);
      let outcome = readVoteResult(null);
      let thrown = false;
      try {
        outcome = readVoteResult(await setVote({ ideaId, want }));
      } catch {
        thrown = true;
      }
      try {
        if (outcome.ok) {
          announce(outcome.voted ? COPY.voted(outcome.count) : COPY.notVoted(outcome.count));
          router.refresh();
          if (refocus) button.current?.focus();
        } else if (outcome.code === "idea_unavailable") {
          announce(VOTE_ERROR_COPY.idea_unavailable);
          router.refresh();
          moveFocusAfterRemoval();
        } else {
          setError({ code: outcome.code, want });
          // An unknown outcome (server, thrown, malformed) drops the optimistic value at once
          // and refreshes once, after this transition ends, to show what really happened.
          if (outcome.code === "server" || thrown) {
            setTimeout(() => {
              router.refresh();
            }, 0);
          }
          if (refocus) button.current?.focus();
        }
      } finally {
        inFlight.current = false;
      }
    });
  };

  const retry = () => {
    if (error === null) return;
    const { code, want } = error;
    if (code !== "no_voter") {
      send(want, true);
      return;
    }
    // The voter cookie is issued on a page load, so load the page once, then send again.
    void fetch("/", { credentials: "same-origin" })
      .catch(() => undefined)
      .then(() => {
        send(want, true);
      });
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className="vote-chip"
        aria-pressed={shown.voted}
        aria-disabled={isPending ? "true" : undefined}
        aria-describedby={`idea-${ideaId}-text`}
        data-voted={shown.voted ? "true" : undefined}
        onClick={() => {
          send(shown.voted ? "off" : "on", false);
        }}
      >
        {shown.voted ? (
          <ArrowUpFilledIcon className="size-4" />
        ) : (
          <ArrowUpIcon className="size-4" />
        )}
        <span aria-hidden="true">{shown.count}</span>
        <span className="sr-only">{COPY.voteName(shown.count)}</span>
      </button>
      {error ? (
        <div className="basis-full">
          <ErrorMessage
            id={`idea-${ideaId}-vote-error`}
            message={VOTE_ERROR_COPY[error.code]}
            onRetry={retry}
          />
        </div>
      ) : null}
    </>
  );
}
