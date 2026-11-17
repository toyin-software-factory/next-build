import { COPY } from "@/lib/copy";
import { formatIdeaDate } from "@/lib/format";
import type { BoardRow } from "@/db/queries";

import { ArrowUpIcon } from "./icons";

/** One idea. The vote chip is static in slice 1: a count, not a button (voting arrives in slice 2). */
export function IdeaRow({ idea }: { idea: Pick<BoardRow, "id" | "text" | "createdAt" | "votes"> }) {
  return (
    <li className="flex items-center gap-4 border-b border-border py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p id={`idea-${idea.id}-text`} className="idea-text">
          {idea.text}
        </p>
        <time className="text-sm text-muted" dateTime={new Date(idea.createdAt).toISOString()}>
          {formatIdeaDate(idea.createdAt)}
        </time>
      </div>
      <div className="vote-chip">
        <ArrowUpIcon className="size-4" />
        <span aria-hidden="true">{idea.votes}</span>
        <span className="sr-only">{COPY.voteLabel(idea.votes)}</span>
      </div>
    </li>
  );
}
