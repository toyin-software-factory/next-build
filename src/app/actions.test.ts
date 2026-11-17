// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted((): { voter: string | null; db: unknown } => ({ voter: null, db: null }));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        state.voter === null || name !== "nb_voter" ? undefined : { value: state.voter },
    }),
}));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));

import { createTestDb, disposeTestDb } from "@/db/test-db";
import { ideas } from "@/db/schema";
import * as queries from "@/db/queries";

import { postIdea } from "./actions";

const VOTER = "11111111-1111-4111-8111-111111111111";
const SUB = "22222222-2222-4222-8222-222222222222";
let logs: string[];

beforeEach(async () => {
  state.voter = VOTER;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => void logs.push(line));
  state.db = await createTestDb();
});

afterAll(disposeTestDb);

const rows = () => (state.db as queries.Db).select().from(ideas);

describe("postIdea", () => {
  it("stores a valid idea and normalizes it", async () => {
    expect(await postIdea({ submissionId: SUB, text: "  Dark \n mode " })).toEqual({ ok: true });
    expect((await rows())[0]?.text).toBe("Dark mode");
  });
  it("refuses empty, too long (with the overshoot), raw too long and malformed input", async () => {
    expect(await postIdea({ submissionId: SUB, text: "  " })).toMatchObject({ code: "empty" });
    expect(await postIdea({ submissionId: SUB, text: "a".repeat(145) })).toMatchObject({
      code: "too_long",
      over: 5,
    });
    expect(await postIdea({ submissionId: SUB, text: "a".repeat(2001) })).toMatchObject({
      code: "raw_too_long",
    });
    expect(await postIdea({ submissionId: "nope", text: "hi" })).toMatchObject({ code: "invalid" });
    expect(await postIdea(null)).toMatchObject({ code: "invalid" });
    expect(await rows()).toHaveLength(0);
  });
  it("counts emoji as one character: 140 accepted, 141 refused", async () => {
    expect(await postIdea({ submissionId: SUB, text: "😀".repeat(140) })).toEqual({ ok: true });
    expect(
      await postIdea({ submissionId: crypto.randomUUID(), text: "😀".repeat(141) }),
    ).toMatchObject({ code: "too_long" });
  });
  it("answers no_voter without a valid cookie", async () => {
    state.voter = null;
    expect(await postIdea({ submissionId: SUB, text: "hi" })).toEqual({
      ok: false,
      code: "no_voter",
    });
  });
  it("stores one row for the same submissionId twice, two for different ids", async () => {
    await postIdea({ submissionId: SUB, text: "same" });
    await postIdea({ submissionId: SUB, text: "same" });
    expect(await rows()).toHaveLength(1);
    await postIdea({ submissionId: crypto.randomUUID(), text: "same" });
    expect(await rows()).toHaveLength(2);
  });
  it("returns server and never logs idea text, the full voter id or the error message", async () => {
    state.db = {
      insert: () => {
        throw Object.assign(
          new Error(`failed for ${VOTER} text secret idea`, { cause: "secret idea" }),
          { name: "D1_ERROR" },
        );
      },
    };
    expect(await postIdea({ submissionId: SUB, text: "secret idea" })).toEqual({
      ok: false,
      code: "server",
    });
    const out = logs.join("\n");
    expect(out).not.toContain("secret idea");
    expect(out).not.toContain(VOTER);
    expect(JSON.parse(logs[0] ?? "")).toEqual({
      event: "idea_post_failed",
      code: "server",
      voter8: "11111111",
      errorName: "D1_ERROR",
    });
  });
  it("logs voter8 only for a valid voter id, never a sliced garbage cookie", async () => {
    state.voter = "garbage-cookie-value";
    await postIdea({ submissionId: SUB, text: "hi" });
    expect(logs.join("\n")).not.toContain("garbage-");
    expect(JSON.parse(logs[0] ?? "")).toEqual({ event: "idea_refused", code: "no_voter" });
  });
});
