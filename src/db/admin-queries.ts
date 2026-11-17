import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import type { Admin } from "@/lib/access";

import { getDb } from "./client";
import type { Db } from "./queries";
import { ideas, votes } from "./schema";

export const ADMIN_LIST_LIMIT = 500;

export type AdminIdeaRow = {
  id: string;
  text: string;
  createdAt: number;
  votes: number;
  hiddenAt: number | null;
};

/**
 * Every idea, hidden ones too, newest first (id last so order is stable). Needs the Admin proof:
 * this file is only importable from src/app/admin and src/lib/access.ts (ESLint, spec 0006).
 */
export async function listIdeasForAdmin(_admin: Admin, db: Db = getDb()): Promise<AdminIdeaRow[]> {
  const rows = await db
    .select({
      id: ideas.id,
      text: ideas.text,
      createdAt: sql<number>`${ideas.createdAt}`,
      votes: sql<number>`count(${votes.voterId})`,
      hiddenAt: sql<number | null>`${ideas.hiddenAt}`,
    })
    .from(ideas)
    .leftJoin(votes, eq(votes.ideaId, ideas.id))
    .groupBy(ideas.id)
    .orderBy(desc(ideas.createdAt), desc(ideas.id))
    .limit(ADMIN_LIST_LIMIT);
  return rows;
}

export type SetHiddenResult = { ok: true } | { ok: false; code: "not_found" };

/**
 * Hides or shows one idea. Hiding keeps the first hidden time (hiding twice changes nothing);
 * showing clears it. Votes are never touched. No matching row is `not_found`.
 */
export async function setIdeaHidden(
  _admin: Admin,
  input: { ideaId: string; hidden: boolean },
  db: Db = getDb(),
  now: Date = new Date(),
): Promise<SetHiddenResult> {
  const hiddenAt = input.hidden ? sql`coalesce(${ideas.hiddenAt}, ${now.getTime()})` : sql`null`;
  const rows = await db
    .update(ideas)
    .set({ hiddenAt })
    .where(eq(ideas.id, input.ideaId))
    .returning({ id: ideas.id });
  return rows.length === 0 ? { ok: false, code: "not_found" } : { ok: true };
}
