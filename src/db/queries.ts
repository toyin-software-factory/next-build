import "server-only";

import { desc, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { getDb } from "./client";
import * as schema from "./schema";
import { ideas, votes, type NewIdea } from "./schema";

/** The Drizzle D1 database: the real D1 in the app, the local workerd D1 in tests. */
export type Db = DrizzleD1Database<typeof schema> & { $client: D1Database };

export const BOARD_LIMIT = 500;

export type BoardRow = {
  id: string;
  text: string;
  createdAt: number;
  votes: number;
  voted: boolean;
};

/** Visible ideas, most votes first, newest first on ties, id last so ties are stable (spec 0002). */
export async function getBoard(voterId: string, db: Db = getDb()): Promise<BoardRow[]> {
  const voteCount = sql<number>`count(${votes.voterId})`;
  const rows = await db
    .select({
      id: ideas.id,
      text: ideas.text,
      createdAt: sql<number>`${ideas.createdAt}`,
      votes: voteCount,
      voted: sql<number>`coalesce(max(${votes.voterId} = ${voterId}), 0)`,
    })
    .from(ideas)
    .leftJoin(votes, sql`${votes.ideaId} = ${ideas.id}`)
    .where(sql`${ideas.hiddenAt} is null`)
    .groupBy(ideas.id)
    .orderBy(desc(voteCount), desc(ideas.createdAt), desc(ideas.id))
    .limit(BOARD_LIMIT);
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    createdAt: r.createdAt,
    votes: r.votes,
    voted: r.voted === 1,
  }));
}

/** Inserts one idea. The same id twice stores one row (a retry or double press is harmless). */
export async function insertIdea(idea: NewIdea, db: Db = getDb()): Promise<void> {
  await db.insert(ideas).values(idea).onConflictDoNothing({ target: ideas.id });
}

export type SetVoteInput = { ideaId: string; voterId: string; want: "on" | "off" };
export type SetVoteResult =
  { ok: true; count: number; voted: boolean } | { ok: false; code: "idea_unavailable" };

/**
 * Puts one voter's vote on one idea into the wanted state (spec 0005). The write only happens while
 * the idea is visible, and the write and the read back run in one D1 batch (one transaction), so a
 * hide cannot land in between. The primary key makes a second vote impossible, so repeating the same
 * wanted state any number of times gives the same result.
 */
export async function setVote(
  { ideaId, voterId, want }: SetVoteInput,
  db: Db = getDb(),
  now: number = Date.now(),
): Promise<SetVoteResult> {
  const visible = "exists (select 1 from ideas where id = ?1 and hidden_at is null)";
  const client = db.$client;
  const write =
    want === "on"
      ? client
          .prepare(
            `insert into votes (idea_id, voter_id, created_at) select ?1, ?2, ?3 where ${visible} on conflict do nothing`,
          )
          .bind(ideaId, voterId, now)
      : client
          .prepare(`delete from votes where idea_id = ?1 and voter_id = ?2 and ${visible}`)
          .bind(ideaId, voterId);
  const readBack = client
    .prepare(
      "select (select count(*) from ideas where id = ?1 and hidden_at is null) as visible, (select count(*) from votes where idea_id = ?1) as count, (select count(*) from votes where idea_id = ?1 and voter_id = ?2) as voted",
    )
    .bind(ideaId, voterId);
  const [, read] = await client.batch<{ visible: number; count: number; voted: number }>([
    write,
    readBack,
  ]);
  const rows = read?.results ?? [];
  const row = rows[0];
  if (row === undefined || row.visible === 0) return { ok: false, code: "idea_unavailable" };
  return { ok: true, count: row.count, voted: row.voted > 0 };
}
