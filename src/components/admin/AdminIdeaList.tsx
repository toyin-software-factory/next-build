import { COPY } from "@/lib/copy";
import { formatIdeaDate } from "@/lib/format";

import { HideButton } from "./HideButton";
import { StatusBadge } from "./StatusBadge";

/** The fields of one admin row the list shows (the shape listIdeasForAdmin returns). */
export type AdminListIdea = {
  id: string;
  text: string;
  createdAt: number;
  votes: number;
  hiddenAt: number | null;
};

function isoDate(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Every idea, hidden ones too (spec 0003, AdminRow). Wide screens get a real table, small screens a
 * labelled list; both come from the same rows and CSS shows one, so a screen reader meets only one.
 */
export function AdminIdeaList({ ideas }: { ideas: readonly AdminListIdea[] }) {
  if (ideas.length === 0) return <p className="text-muted">{COPY.adminEmpty}</p>;
  return (
    <>
      <ul aria-label={COPY.adminListLabel} className="admin:hidden">
        {ideas.map((idea) => {
          const textId = `admin-list-${idea.id}-text`;
          return (
            <li
              key={idea.id}
              className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0"
            >
              <p id={textId} className="idea-text">
                {idea.text}
              </p>
              <p className="text-sm text-muted tabular-nums">
                {COPY.adminColVotes}: {idea.votes}
              </p>
              <p className="text-sm text-muted">
                {COPY.adminColAdded}:{" "}
                <time dateTime={isoDate(idea.createdAt)}>{formatIdeaDate(idea.createdAt)}</time>
              </p>
              <p className="flex items-center gap-2 text-sm text-muted">
                {COPY.adminColStatus}: <StatusBadge hidden={idea.hiddenAt !== null} />
              </p>
              <div className="flex flex-wrap items-start">
                <HideButton ideaId={idea.id} hidden={idea.hiddenAt !== null} describedBy={textId} />
              </div>
            </li>
          );
        })}
      </ul>
      <table className="hidden w-full text-left admin:table">
        <caption className="sr-only">{COPY.adminListLabel}</caption>
        <thead>
          <tr className="border-b border-border-strong text-sm">
            <th scope="col" className="py-2 pr-4 font-semibold">
              {COPY.adminColIdea}
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {COPY.adminColVotes}
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {COPY.adminColAdded}
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {COPY.adminColStatus}
            </th>
            <th scope="col" className="py-2 font-semibold">
              {COPY.adminColAction}
            </th>
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea) => {
            const textId = `admin-table-${idea.id}-text`;
            return (
              <tr key={idea.id} className="border-b border-border align-top last:border-b-0">
                <td id={textId} className="idea-text py-4 pr-4">
                  {idea.text}
                </td>
                <td className="py-4 pr-4 tabular-nums">{idea.votes}</td>
                <td className="py-4 pr-4 text-sm whitespace-nowrap text-muted">
                  <time dateTime={isoDate(idea.createdAt)}>{formatIdeaDate(idea.createdAt)}</time>
                </td>
                <td className="py-4 pr-4">
                  <StatusBadge hidden={idea.hiddenAt !== null} />
                </td>
                <td className="py-3">
                  <HideButton
                    ideaId={idea.id}
                    hidden={idea.hiddenAt !== null}
                    describedBy={textId}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
