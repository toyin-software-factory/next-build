import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  getDb: () => {
    throw new Error("tests pass their own db");
  },
}));

import { BOARD_LIMIT, getBoard, insertIdea, type Db } from "./queries";
import { ideas, votes } from "./schema";
import { createTestDb } from "./test-db";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
let db: Db;

const idea = (id: string, createdAt: number, text = id, hiddenAt: number | null = null) => ({
  id,
  text,
  authorVoterId: V1,
  createdAt: new Date(createdAt),
  hiddenAt: hiddenAt ? new Date(hiddenAt) : null,
});

beforeEach(() => {
  db = createTestDb();
});

describe("getBoard", () => {
  it("returns 500 of 501 ideas", async () => {
    for (let i = 0; i < BOARD_LIMIT + 1; i++)
      await insertIdea(idea(`i${String(i).padStart(4, "0")}`, i), db);
    expect(await getBoard(V1, db)).toHaveLength(BOARD_LIMIT);
  });

  it("excludes hidden ideas", async () => {
    await insertIdea(idea("a", 1), db);
    await insertIdea(idea("b", 2, "b", 5), db);
    expect((await getBoard(V1, db)).map((r) => r.id)).toEqual(["a"]);
  });

  it("orders by votes, then newest, then id desc", async () => {
    await insertIdea(idea("a", 10), db);
    await insertIdea(idea("b", 10), db);
    await insertIdea(idea("c", 20), db);
    await insertIdea(idea("d", 1), db);
    await db.insert(votes).values({ ideaId: "d", voterId: V1, createdAt: new Date(1) });
    expect((await getBoard(V1, db)).map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("counts votes and flags the caller's own", async () => {
    await insertIdea(idea("a", 1), db);
    await db.insert(votes).values([
      { ideaId: "a", voterId: V1, createdAt: new Date(1) },
      { ideaId: "a", voterId: V2, createdAt: new Date(2) },
    ]);
    expect(await getBoard(V1, db)).toEqual([
      { id: "a", text: "a", createdAt: 1, votes: 2, voted: true },
    ]);
    expect((await getBoard("", db))[0]?.voted).toBe(false);
  });
});

describe("insertIdea", () => {
  it("stores one row for the same id twice", async () => {
    await insertIdea(idea("a", 1, "first"), db);
    await insertIdea(idea("a", 2, "second"), db);
    const rows = await db.select().from(ideas);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe("first");
  });

  it("stores a second idea for a new id with the same text", async () => {
    await insertIdea(idea("a", 1, "same"), db);
    await insertIdea(idea("b", 2, "same"), db);
    expect(await db.select().from(ideas)).toHaveLength(2);
  });
});
