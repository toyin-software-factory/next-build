"use client";

import { useRouter } from "next/navigation";

import { setVote } from "@/app/actions";
import { COPY } from "@/lib/copy";

import { ArrowUpIcon } from "./icons";

/** Thin thread: a plain vote button that sends the wanted state and refreshes the board. */
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
  const press = async () => {
    await setVote({ ideaId, want: voted ? "off" : "on" });
    router.refresh();
  };
  return (
    <button
      type="button"
      className="vote-chip"
      aria-pressed={voted}
      aria-describedby={`idea-${ideaId}-text`}
      onClick={() => void press()}
    >
      <ArrowUpIcon className="size-4" />
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{COPY.voteName(count)}</span>
    </button>
  );
}
