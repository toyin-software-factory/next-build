import { formatIdeaDate } from "@/lib/format";
import type { BoardRow } from "@/db/queries";

import { VoteButton } from "./VoteButton";

/** One idea with its vote button. */
export function IdeaRow({
  idea,
}: {
  idea: Pick<BoardRow, "id" | "text" | "createdAt" | "votes" | "voted">;
}) {
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
      <VoteButton ideaId={idea.id} count={idea.votes} voted={idea.voted} />
    </li>
  );
}
