import "server-only";

import { desc, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import { getDb } from "./client";
import * as schema from "./schema";
import { ideas, votes, type NewIdea } from "./schema";

/** Any async Drizzle SQLite database: D1 in the app, a local SQLite in tests. */
export type Db = BaseSQLiteDatabase<"async", unknown, typeof schema>;

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
