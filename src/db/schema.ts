import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Spec 0002. A visible idea has hidden_at null. Hiding sets it, nothing is deleted. */
export const ideas = sqliteTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    text: text("text").notNull(),
    authorVoterId: text("author_voter_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    hiddenAt: integer("hidden_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    check("ideas_text_length", sql`length(${t.text}) between 1 and 140`),
    index("ideas_visible_created_idx").on(t.hiddenAt, t.createdAt),
  ],
);

/** One row per (idea, browser): the primary key is the one vote rule. */
export const votes = sqliteTable(
  "votes",
  {
    ideaId: text("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    voterId: text("voter_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.voterId] }), index("votes_voter_idx").on(t.voterId)],
);

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
export type Vote = typeof votes.$inferSelect;
