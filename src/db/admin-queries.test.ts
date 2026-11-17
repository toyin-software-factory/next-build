// @vitest-environment node
import { afterAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import type { Admin } from "@/lib/access";

import {
  ADMIN_LIST_LIMIT,
  countIdeasForAdmin,
  listIdeasForAdmin,
  setIdeaHidden,
} from "./admin-queries";
import { getBoard, insertIdea, setVote } from "./queries";
import type { Db } from "./queries";
import { ideas, votes } from "./schema";
import { createTestDb, disposeTestDb } from "./test-db";

// The test is the only place a fake proof is made; production code cannot (ESLint ban).
// eslint-disable-next-line no-restricted-syntax
const admin = { email: "admin@x.test" } as Admin;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const VOTER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
  await insertIdea(
    { id: A, text: "old", authorVoterId: VOTER, createdAt: new Date(1000), hiddenAt: null },
    db,
  );
  await insertIdea(
    { id: B, text: "new", authorVoterId: VOTER, createdAt: new Date(2000), hiddenAt: null },
    db,
  );
  await db.insert(votes).values({ ideaId: A, voterId: VOTER, createdAt: new Date(1500) });
});

afterAll(disposeTestDb);

describe("listIdeasForAdmin", () => {
  it("lists every idea newest first with votes and hidden time", async () => {
    await setIdeaHidden(admin, { ideaId: A, hidden: true }, db, new Date(5000));
    const rows = await listIdeasForAdmin(admin, db);
    expect(rows.map((r) => r.id)).toEqual([B, A]);
    expect(rows[1]).toMatchObject({ votes: 1, hiddenAt: 5000 });
    expect(rows[0]).toMatchObject({ votes: 0, hiddenAt: null });
  });
});

describe("countIdeasForAdmin", () => {
  it("counts every idea and the hidden ones", async () => {
    expect(await countIdeasForAdmin(admin, db)).toEqual({ total: 2, hidden: 0 });
    await setIdeaHidden(admin, { ideaId: A, hidden: true }, db, new Date(5000));
    expect(await countIdeasForAdmin(admin, db)).toEqual({ total: 2, hidden: 1 });
  });
});

describe("setIdeaHidden", () => {
  it("hides, keeps the first hidden time, and shows again", async () => {
    expect(await setIdeaHidden(admin, { ideaId: A, hidden: true }, db, new Date(5000))).toEqual({
      ok: true,
    });
    await setIdeaHidden(admin, { ideaId: A, hidden: true }, db, new Date(9000));
    expect((await listIdeasForAdmin(admin, db)).find((r) => r.id === A)?.hiddenAt).toBe(5000);
    expect((await getBoard(VOTER, db)).map((r) => r.id)).toEqual([B]);

    await setIdeaHidden(admin, { ideaId: A, hidden: false }, db);
    expect((await getBoard(VOTER, db)).map((r) => r.id).sort()).toEqual([A, B].sort());
  });

  it("never touches votes", async () => {
    await setIdeaHidden(admin, { ideaId: A, hidden: true }, db);
    await setIdeaHidden(admin, { ideaId: A, hidden: false }, db);
    expect((await getBoard(VOTER, db)).find((r) => r.id === A)?.votes).toBe(1);
  });

  it("reports not_found for an unknown idea", async () => {
    expect(await setIdeaHidden(admin, { ideaId: "nope", hidden: true }, db)).toEqual({
      ok: false,
      code: "not_found",
    });
  });
});

describe("hiding and voting together", () => {
  const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("refuses a vote once the admin hides the idea, and accepts it again after unhide", async () => {
    await setIdeaHidden(admin, { ideaId: B, hidden: true }, db);
    expect(await setVote({ ideaId: B, voterId: OTHER, want: "on" }, db)).toEqual({
      ok: false,
      code: "idea_unavailable",
    });
    expect((await listIdeasForAdmin(admin, db)).find((r) => r.id === B)?.votes).toBe(0);

    await setIdeaHidden(admin, { ideaId: B, hidden: false }, db);
    expect(await setVote({ ideaId: B, voterId: OTHER, want: "on" }, db)).toEqual({
      ok: true,
      count: 1,
      voted: true,
    });
  });

  it("keeps an existing vote through hide and unhide, and counts it again on the board", async () => {
    await setIdeaHidden(admin, { ideaId: A, hidden: true }, db);
    expect((await listIdeasForAdmin(admin, db)).find((r) => r.id === A)?.votes).toBe(1);
    await setIdeaHidden(admin, { ideaId: A, hidden: false }, db);
    const row = (await getBoard(VOTER, db)).find((r) => r.id === A);
    expect(row).toMatchObject({ votes: 1, voted: true });
  });

  it("treats hiding twice and showing a visible idea as no change", async () => {
    expect(await setIdeaHidden(admin, { ideaId: B, hidden: false }, db)).toEqual({ ok: true });
    expect(await countIdeasForAdmin(admin, db)).toEqual({ total: 2, hidden: 0 });
    await setIdeaHidden(admin, { ideaId: B, hidden: true }, db);
    await setIdeaHidden(admin, { ideaId: B, hidden: true }, db);
    expect(await countIdeasForAdmin(admin, db)).toEqual({ total: 2, hidden: 1 });
  });
});

describe("the admin list cap", () => {
  it("lists at most the limit, newest first, while the counts cover every idea", async () => {
    const extra = ADMIN_LIST_LIMIT + 1 - 2;
    const bulk = Array.from({ length: extra }, (_, i) => ({
      id: `bulk-${String(i).padStart(4, "0")}`,
      text: `bulk ${String(i)}`,
      authorVoterId: VOTER,
      createdAt: new Date(10_000 + i),
      hiddenAt: null,
    }));
    // D1 allows only so many bound values per statement, so insert in small chunks.
    for (let i = 0; i < bulk.length; i += 15) {
      await db.insert(ideas).values(bulk.slice(i, i + 15));
    }
    const rows = await listIdeasForAdmin(admin, db);
    expect(rows).toHaveLength(ADMIN_LIST_LIMIT);
    expect(rows[0]?.id).toBe(`bulk-${String(extra - 1).padStart(4, "0")}`);
    expect(rows.some((r) => r.id === A)).toBe(false);
    expect(await countIdeasForAdmin(admin, db)).toEqual({ total: ADMIN_LIST_LIMIT + 1, hidden: 0 });
  });
});

describe("the Admin proof", () => {
  it("is the first parameter of every admin query", () => {
    expectTypeOf(listIdeasForAdmin).parameter(0).toEqualTypeOf<Admin>();
    expectTypeOf(setIdeaHidden).parameter(0).toEqualTypeOf<Admin>();
  });

  it("cannot be made from a plain object", () => {
    // Type check only: the function is never called.
    const neverCalled = () =>
      // @ts-expect-error a plain { email } is not an Admin
      listIdeasForAdmin({ email: "admin@x.test" }, db);
    expect(neverCalled).toBeTypeOf("function");
  });
});
