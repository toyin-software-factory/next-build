// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  getDb: () => {
    throw new Error("tests pass their own db");
  },
}));

import { BOARD_LIMIT, getBoard, insertIdea, setVote, type Db } from "./queries";
import { ideas, votes } from "./schema";
import { createTestDb, disposeTestDb } from "./test-db";

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

beforeEach(async () => {
  db = await createTestDb();
});

afterAll(disposeTestDb);

describe("getBoard", () => {
  it("returns 500 of 501 ideas", async () => {
    const all = Array.from({ length: BOARD_LIMIT + 1 }, (_, i) =>
      idea(`i${String(i).padStart(4, "0")}`, i),
    );
    // D1 allows 100 bound values per statement, so insert in small chunks.
    for (let i = 0; i < all.length; i += 10) await db.insert(ideas).values(all.slice(i, i + 10));
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

describe("votes", () => {
  it("refuses a second vote by the same voter on the same idea (primary key)", async () => {
    await insertIdea(idea("a", 1), db);
    await db.insert(votes).values({ ideaId: "a", voterId: V1, createdAt: new Date(1) });
    await expect(
      db.insert(votes).values({ ideaId: "a", voterId: V1, createdAt: new Date(2) }),
    ).rejects.toThrow();
    expect(await db.select().from(votes)).toHaveLength(1);
    // A different voter on the same idea is fine.
    await db.insert(votes).values({ ideaId: "a", voterId: V2, createdAt: new Date(3) });
    expect(await db.select().from(votes)).toHaveLength(2);
  });
});

describe("setVote", () => {
  it("turns on and off, and repeating either changes nothing more", async () => {
    await db.insert(ideas).values(idea("a", 1));
    const on = { ideaId: "a", voterId: V1, want: "on" as const };
    const off = { ...on, want: "off" as const };
    expect(await setVote(on, db)).toEqual({ ok: true, count: 1, voted: true });
    expect(await setVote(on, db)).toEqual({ ok: true, count: 1, voted: true });
    expect(await setVote(off, db)).toEqual({ ok: true, count: 0, voted: false });
    expect(await setVote(off, db)).toEqual({ ok: true, count: 0, voted: false });
  });
  it("keeps one row for the same browser under parallel requests", async () => {
    await db.insert(ideas).values(idea("a", 1));
    await Promise.all(
      Array.from({ length: 5 }, () => setVote({ ideaId: "a", voterId: V1, want: "on" }, db)),
    );
    expect(await db.select().from(votes)).toHaveLength(1);
  });
  it("counts each browser once and only removes its own vote", async () => {
    await db.insert(ideas).values(idea("a", 1));
    await setVote({ ideaId: "a", voterId: V1, want: "on" }, db);
    expect(await setVote({ ideaId: "a", voterId: V2, want: "on" }, db)).toEqual({
      ok: true,
      count: 2,
      voted: true,
    });
    expect(await setVote({ ideaId: "a", voterId: V1, want: "off" }, db)).toEqual({
      ok: true,
      count: 1,
      voted: false,
    });
  });
  it("refuses a hidden or missing idea and leaves votes untouched", async () => {
    await db.insert(ideas).values(idea("h", 1, "h", 5));
    for (const want of ["on", "off"] as const) {
      for (const ideaId of ["h", "missing"])
        expect(await setVote({ ideaId, voterId: V1, want }, db)).toEqual({
          ok: false,
          code: "idea_unavailable",
        });
    }
    expect(await db.select().from(votes)).toHaveLength(0);
  });
  it("does not remove an existing vote once the idea is hidden", async () => {
    await db.insert(ideas).values(idea("a", 1));
    await setVote({ ideaId: "a", voterId: V1, want: "on" }, db);
    await db.update(ideas).set({ hiddenAt: new Date(9) });
    expect(await setVote({ ideaId: "a", voterId: V1, want: "off" }, db)).toMatchObject({
      code: "idea_unavailable",
    });
    expect(await db.select().from(votes)).toHaveLength(1);
  });
});
