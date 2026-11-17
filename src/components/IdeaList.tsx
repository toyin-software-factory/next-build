import { COPY } from "@/lib/copy";
import type { BoardRow } from "@/db/queries";

import { IdeaRow } from "./IdeaRow";

export function IdeaList({ ideas }: { ideas: BoardRow[] }) {
  return (
    <section aria-labelledby="ideas-heading">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 id="ideas-heading" tabIndex={-1} className="text-sm font-semibold">
          {COPY.listHeading}
        </h2>
        <p className="text-sm text-muted">{COPY.sortNote}</p>
      </div>
      <ul>
        {ideas.map((idea) => (
          <IdeaRow key={idea.id} idea={idea} />
        ))}
      </ul>
    </section>
  );
}
