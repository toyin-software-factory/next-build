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
const checkVote = vi.hoisted(() =>
  vi.fn<() => Promise<{ ok: true } | { ok: false; code: "rate_limited" }>>(),
);
const checkPost = vi.hoisted(() =>
  vi.fn<
    (input: {
      voterId: string;
      ip: string | null;
      token?: string;
    }) => Promise<{ ok: true } | { ok: false; code: "rate_limited" | "challenge_failed" }>
  >(),
);
vi.mock("@/lib/abuse", async (original) => ({
  ...(await original<typeof import("@/lib/abuse")>()),
  checkVote,
  checkPost,
}));

import { createTestDb, disposeTestDb } from "@/db/test-db";
import { ideas, votes } from "@/db/schema";
import * as queries from "@/db/queries";

import { postIdea, setVote } from "./actions";

const VOTER = "11111111-1111-4111-8111-111111111111";
const SUB = "22222222-2222-4222-8222-222222222222";
let logs: string[];

beforeEach(async () => {
  state.voter = VOTER;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => void logs.push(line));
  state.db = await createTestDb();
  checkVote.mockReset();
  checkVote.mockResolvedValue({ ok: true });
  checkPost.mockReset();
  checkPost.mockResolvedValue({ ok: true });
});

afterAll(disposeTestDb);

const rows = () => (state.db as queries.Db).select().from(ideas);

describe("postIdea abuse checks", () => {
  it("runs checkPost after validation and passes the token, and returns its refusal without storing", async () => {
    await postIdea({ submissionId: SUB, text: "   " });
    expect(checkPost).not.toHaveBeenCalled();
    checkPost.mockResolvedValueOnce({ ok: false, code: "challenge_failed" });
    expect(await postIdea({ submissionId: SUB, text: "Dark mode", token: "tok" })).toEqual({
      ok: false,
      code: "challenge_failed",
    });
    expect(checkPost).toHaveBeenCalledWith({ voterId: VOTER, ip: null, token: "tok" });
    expect(await rows()).toHaveLength(0);
    checkPost.mockResolvedValueOnce({ ok: false, code: "rate_limited" });
    expect(await postIdea({ submissionId: SUB, text: "Dark mode" })).toEqual({
      ok: false,
      code: "rate_limited",
    });
    expect(await rows()).toHaveLength(0);
  });

  it("answers a retry of a saved idea with success and runs no abuse check (AC-17)", async () => {
    expect(await postIdea({ submissionId: SUB, text: "Dark mode" })).toEqual({ ok: true });
    checkPost.mockClear();
    checkPost.mockResolvedValue({ ok: false, code: "rate_limited" });
    expect(await postIdea({ submissionId: SUB, text: "Dark mode" })).toEqual({ ok: true });
    expect(checkPost).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(1);
  });

  it("still runs the checks when the lookup fails", async () => {
    vi.spyOn(queries, "ideaExists").mockRejectedValueOnce(new Error("d1 down"));
    expect(await postIdea({ submissionId: SUB, text: "Dark mode" })).toEqual({ ok: true });
    expect(checkPost).toHaveBeenCalledOnce();
  });
});

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

describe("setVote", () => {
  const IDEA = "33333333-3333-4333-8333-333333333333";
  const db = () => state.db as queries.Db;
  const seed = async (hiddenAt: Date | null = null) => {
    await db()
      .insert(ideas)
      .values({
        id: IDEA,
        text: "Dark mode",
        authorVoterId: VOTER,
        createdAt: new Date(1),
        hiddenAt,
      });
  };
  const voteRows = () => db().select().from(votes);
  const lastLog = () => JSON.parse(logs.at(-1) ?? "{}") as Record<string, unknown>;

  it("votes, then unvotes, and returns the server's count and voted", async () => {
    await seed();
    expect(await setVote({ ideaId: IDEA, want: "on" })).toEqual({
      ok: true,
      count: 1,
      voted: true,
    });
    expect(await setVote({ ideaId: IDEA, want: "off" })).toEqual({
      ok: true,
      count: 0,
      voted: false,
    });
    expect(await voteRows()).toHaveLength(0);
  });
  it("repeating the wanted state, even in parallel, changes nothing more", async () => {
    await seed();
    const results = await Promise.all([
      setVote({ ideaId: IDEA, want: "on" }),
      setVote({ ideaId: IDEA, want: "on" }),
      setVote({ ideaId: IDEA, want: "on" }),
    ]);
    for (const r of results) expect(r).toEqual({ ok: true, count: 1, voted: true });
    expect(await voteRows()).toHaveLength(1);
    expect(await setVote({ ideaId: IDEA, want: "off" })).toMatchObject({ count: 0 });
    expect(await setVote({ ideaId: IDEA, want: "off" })).toEqual({
      ok: true,
      count: 0,
      voted: false,
    });
  });
  it("counts two different browsers once each", async () => {
    await seed();
    await setVote({ ideaId: IDEA, want: "on" });
    state.voter = "44444444-4444-4444-8444-444444444444";
    expect(await setVote({ ideaId: IDEA, want: "on" })).toEqual({
      ok: true,
      count: 2,
      voted: true,
    });
    state.voter = VOTER;
    expect(await setVote({ ideaId: IDEA, want: "off" })).toEqual({
      ok: true,
      count: 1,
      voted: false,
    });
  });
  it("refuses a hidden or missing idea with idea_unavailable and writes nothing", async () => {
    await seed(new Date(5));
    expect(await setVote({ ideaId: IDEA, want: "on" })).toEqual({
      ok: false,
      code: "idea_unavailable",
    });
    expect(await setVote({ ideaId: IDEA, want: "off" })).toEqual({
      ok: false,
      code: "idea_unavailable",
    });
    expect(await setVote({ ideaId: crypto.randomUUID(), want: "on" })).toMatchObject({
      code: "idea_unavailable",
    });
    expect(await voteRows()).toHaveLength(0);
    expect(lastLog()).toEqual({
      event: "vote_refused",
      code: "idea_unavailable",
      voter8: "11111111",
    });
  });
  it("answers no_voter without a valid cookie and writes nothing", async () => {
    await seed();
    state.voter = "garbage-cookie-value";
    expect(await setVote({ ideaId: IDEA, want: "on" })).toEqual({ ok: false, code: "no_voter" });
    expect(await voteRows()).toHaveLength(0);
    expect(logs.join("\n")).not.toContain("garbage-");
    expect(lastLog()).toEqual({ event: "vote_refused", code: "no_voter" });
  });
  it("answers invalid for a bad idea id or wanted state", async () => {
    await seed();
    for (const bad of [
      null,
      {},
      { ideaId: "nope", want: "on" },
      { ideaId: IDEA, want: "toggle" },
      { ideaId: IDEA },
    ])
      expect(await setVote(bad)).toEqual({ ok: false, code: "invalid" });
    expect(lastLog()).toEqual({ event: "vote_refused", code: "invalid", voter8: "11111111" });
    expect(await voteRows()).toHaveLength(0);
  });
  it("runs checkVote after validation and before the write, and returns rate_limited", async () => {
    await seed();
    await setVote({ ideaId: "nope", want: "on" });
    expect(checkVote).not.toHaveBeenCalled();
    checkVote.mockResolvedValueOnce({ ok: false, code: "rate_limited" });
    expect(await setVote({ ideaId: IDEA, want: "on" })).toEqual({
      ok: false,
      code: "rate_limited",
    });
    expect(checkVote).toHaveBeenCalledWith({ voterId: VOTER, ip: null });
    expect(await voteRows()).toHaveLength(0);
    expect(lastLog()).toEqual({ event: "vote_refused", code: "rate_limited", voter8: "11111111" });
  });
  it("logs a vote_set line with only event, code and voter8", async () => {
    await seed();
    await setVote({ ideaId: IDEA, want: "on" });
    expect(lastLog()).toEqual({ event: "vote_set", code: "ok", voter8: "11111111" });
  });
  it("returns server on a database error and never logs the message or the full voter id", async () => {
    state.db = {
      $client: {
        prepare: () => {
          throw Object.assign(new Error(`failed for ${VOTER}`), { name: "D1_ERROR" });
        },
      },
    };
    expect(await setVote({ ideaId: IDEA, want: "on" })).toEqual({ ok: false, code: "server" });
    expect(logs.join("\n")).not.toContain(VOTER);
    expect(Object.keys(lastLog()).sort()).toEqual(["code", "errorName", "event", "voter8"]);
    expect(lastLog()).toMatchObject({ event: "vote_failed", code: "server" });
  });
});
