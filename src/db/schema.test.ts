// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  getDb: () => {
    throw new Error("tests pass their own db");
  },
}));

import type { Db } from "./queries";
import { ideas, votes } from "./schema";
import { createTestDb, disposeTestDb } from "./test-db";

const V1 = "11111111-1111-4111-8111-111111111111";
let db: Db;

const row = (id: string, text: string) => ({
  id,
  text,
  authorVoterId: V1,
  createdAt: new Date(1000),
});

beforeEach(async () => {
  db = await createTestDb();
});

afterAll(disposeTestDb);

// Spec 0002, Schema: the migrations in drizzle/ are what production runs, so these tests read the
// live local D1 built from them, not the Drizzle definitions.
describe("ideas.text length check (spec 0002)", () => {
  it.each([
    ["1 character", "a"],
    ["140 characters", "a".repeat(140)],
    ["140 code points that are emoji", "😀".repeat(140)],
  ])("accepts %s", async (_name, text) => {
    await db.insert(ideas).values(row("ok", text));
    const stored = await db.select().from(ideas);
    expect(stored).toHaveLength(1);
  });

  it.each([
    ["an empty string", ""],
    ["141 characters", "a".repeat(141)],
    ["141 code points that are emoji", "😀".repeat(141)],
  ])("refuses %s even when the app check is skipped", async (_name, text) => {
    await expect(db.insert(ideas).values(row("bad", text))).rejects.toThrow();
    expect(await db.select().from(ideas)).toHaveLength(0);
  });
});

describe("required columns", () => {
  it("refuses an idea with no author voter id", async () => {
    await expect(
      db.run(sql`insert into ideas (id, text, created_at) values ('x', 'hello', 1)`),
    ).rejects.toThrow();
  });

  it("stores a new idea as visible: hidden_at is null", async () => {
    await db.insert(ideas).values(row("a", "hello"));
    const [stored] = await db.select().from(ideas);
    expect(stored?.hiddenAt).toBeNull();
  });
});

describe("votes", () => {
  it("are deleted with their idea (on delete cascade)", async () => {
    await db.insert(ideas).values([row("a", "one"), row("b", "two")]);
    await db.insert(votes).values([
      { ideaId: "a", voterId: V1, createdAt: new Date(2000) },
      { ideaId: "b", voterId: V1, createdAt: new Date(2000) },
    ]);
    await db.delete(ideas).where(sql`id = 'a'`);
    const left = await db.select().from(votes);
    expect(left.map((v) => v.ideaId)).toEqual(["b"]);
  });

  it("cannot point at an idea that does not exist", async () => {
    await expect(
      db.insert(votes).values({ ideaId: "missing", voterId: V1, createdAt: new Date(2000) }),
    ).rejects.toThrow();
  });
});

describe("the migrated schema", () => {
  it("has the two spec indexes on ideas and votes", async () => {
    const found = await db.all<{ name: string }>(
      sql`select name from sqlite_master where type = 'index' and name in ('ideas_visible_created_idx', 'votes_voter_idx')`,
    );
    expect(found.map((i) => i.name).sort()).toEqual([
      "ideas_visible_created_idx",
      "votes_voter_idx",
    ]);
  });

  it("makes (idea_id, voter_id) the votes primary key and nothing else", async () => {
    const columns = await db.all<{ name: string; pk: number }>(
      sql`select name, pk from pragma_table_info('votes') where pk > 0 order by pk`,
    );
    expect(columns.map((c) => c.name)).toEqual(["idea_id", "voter_id"]);
  });

  it("has no stored vote count column (counts come from a query)", async () => {
    const columns = await db.all<{ name: string }>(
      sql`select name from pragma_table_info('ideas')`,
    );
    expect(columns.map((c) => c.name).sort()).toEqual([
      "author_voter_id",
      "created_at",
      "hidden_at",
      "id",
      "text",
    ]);
  });
});
