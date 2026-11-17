// @vitest-environment node
import { afterAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import type { Admin } from "@/lib/access";

import { listIdeasForAdmin, setIdeaHidden } from "./admin-queries";
import { getBoard, insertIdea } from "./queries";
import type { Db } from "./queries";
import { votes } from "./schema";
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
