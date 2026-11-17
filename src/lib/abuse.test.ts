// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, disposeTestDb } from "@/db/test-db";
import { HOUR_MS, windowStart } from "@/db/abuse-queries";
import { rateEvents } from "@/db/schema";
import type { Db } from "@/db/queries";

import { LIMITS, addressKeyText, checkPost, checkVote, ipKey, type Limiter } from "./abuse";

// These tests write to a real local D1. Under a loaded machine (the whole suite in parallel) the default 5 seconds is too tight.
vi.setConfig({ testTimeout: 30_000 });

const SALT = "test-salt-for-unit-tests-0000";
const NOW = 1_800_000_000_000;
const V = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const okFetch = () =>
  Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
const allow: Limiter = { limit: () => Promise.resolve({ success: true }) };

let db: Db;
let logs: string[];
beforeEach(async () => {
  db = await createTestDb();
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => void logs.push(line));
});
afterAll(disposeTestDb);

const count = async () => (await db.select().from(rateEvents)).length;
const post = (voter: string, ip: string | null, extra = {}) =>
  checkPost(
    { voterId: voter, ip, token: "tok" },
    { db, limiter: allow, fetch: okFetch, now: NOW, salt: SALT, ...extra },
  );
const vote = (voter: string, ip: string | null, extra = {}) =>
  checkVote({ voterId: voter, ip }, { db, limiter: allow, now: NOW, salt: SALT, ...extra });

describe("ipKey and addressKeyText (AC-6, AC-7)", () => {
  it("hashes an IPv4 address to 32 hex characters, the same every time", async () => {
    const a = await ipKey("203.0.113.9", SALT);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await ipKey("203.0.113.9", SALT)).toBe(a);
    expect(await ipKey("203.0.113.10", SALT)).not.toBe(a);
    expect(await ipKey("203.0.113.9", "another-salt-000000000")).not.toBe(a);
    expect(a).not.toContain("203");
  });
  it("uses the first 64 bits of an IPv6 address", async () => {
    const a = await ipKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd", SALT);
    expect(await ipKey("2001:0db8:0001:0002::1", SALT)).toBe(a);
    expect(await ipKey("2001:db8:1:3::1", SALT)).not.toBe(a);
  });
  it("treats an IPv4 mapped IPv6 address as the IPv4 address", async () => {
    expect(addressKeyText("::ffff:1.2.3.4")).toBe("4:1.2.3.4");
    expect(await ipKey("::ffff:1.2.3.4", SALT)).toBe(await ipKey("1.2.3.4", SALT));
    expect(await ipKey("::ffff:102:304", SALT)).toBe(await ipKey("1.2.3.4", SALT));
  });
  it("gives the shared key none for a missing or malformed address", async () => {
    for (const ip of [null, "", "garbage", "999.1.1.1", "fe80::1%eth0"]) {
      expect(await ipKey(ip, SALT)).toBe("none");
    }
  });
});

describe("windowStart (AC-5)", () => {
  it("aligns to the clock hour", () => {
    expect(windowStart(HOUR_MS * 5)).toBe(HOUR_MS * 5);
    expect(windowStart(HOUR_MS * 5 + HOUR_MS - 1)).toBe(HOUR_MS * 5);
    expect(windowStart(HOUR_MS * 6)).toBe(HOUR_MS * 6);
  });
});

describe("hourly post limit (AC-2, AC-5)", () => {
  it("allows 5 per browser and refuses the 6th without writing", async () => {
    for (let i = 0; i < LIMITS.post.voter; i++)
      expect(await post(V(1), "198.51.100.1")).toEqual({ ok: true });
    expect(await post(V(1), "198.51.100.1")).toEqual({ ok: false, code: "rate_limited" });
    expect(await count()).toBe(5);
  });
  it("stops a visitor who changes browser id at the 16th post from one address", async () => {
    for (let i = 0; i < LIMITS.post.ip; i++)
      expect(await post(V(100 + i), "198.51.100.2")).toEqual({ ok: true });
    expect(await post(V(999), "198.51.100.2")).toEqual({ ok: false, code: "rate_limited" });
    expect(await post(V(999), "198.51.100.77")).toEqual({ ok: true });
  });
  it("allows again in the next clock hour", async () => {
    for (let i = 0; i < 5; i++) await post(V(1), "198.51.100.3");
    expect((await post(V(1), "198.51.100.3")).ok).toBe(false);
    expect(await post(V(1), "198.51.100.3", { now: NOW + HOUR_MS })).toEqual({ ok: true });
  });
  it("gives everyone without an address one shared allowance of 5", async () => {
    for (let i = 0; i < 5; i++) expect((await post(V(200 + i), null)).ok).toBe(true);
    expect((await post(V(300), null)).ok).toBe(false);
  });
});

describe("hourly vote limit (AC-3, AC-4)", () => {
  it("allows 60 per browser, counting unvotes and repeats the same, and refuses the 61st", async () => {
    for (let i = 0; i < 60; i++) expect((await vote(V(1), "198.51.100.4")).ok).toBe(true);
    expect(await vote(V(1), "198.51.100.4")).toEqual({ ok: false, code: "rate_limited" });
    expect(await count()).toBe(60);
  });
  it("stops the address at 150 whatever the browser id", async () => {
    const key = await ipKey("198.51.100.5", SALT);
    const rows = Array.from({ length: 149 }, (_, i) => ({
      kind: "vote" as const,
      voterKey: V(1000 + i),
      ipKey: key,
      windowStart: windowStart(NOW),
    }));
    for (let i = 0; i < rows.length; i += 20) {
      await db.insert(rateEvents).values(rows.slice(i, i + 20));
    }
    expect((await vote(V(5000), "198.51.100.5")).ok).toBe(true);
    expect(await vote(V(5001), "198.51.100.5")).toEqual({ ok: false, code: "rate_limited" });
    expect(await count()).toBe(150);
  });
});

describe("one atomic statement (AC-14)", () => {
  it("lets exactly one of several parallel requests take the last slot", async () => {
    for (let i = 0; i < 4; i++) await post(V(1), "198.51.100.6");
    const results = await Promise.all(Array.from({ length: 6 }, () => post(V(1), "198.51.100.6")));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await count()).toBe(5);
  });
  it("a capped browser writes nothing, so it cannot use up the address quota", async () => {
    for (let i = 0; i < 60; i++) await vote(V(1), "198.51.100.7");
    const before = await count();
    for (let i = 0; i < 20; i++) expect((await vote(V(1), "198.51.100.7")).ok).toBe(false);
    expect(await count()).toBe(before);
    expect((await vote(V(2), "198.51.100.7")).ok).toBe(true);
  });
  it("refuses a voter at 59 when the address is at 149 only once, and writes nothing for the refused one", async () => {
    for (let i = 0; i < 149; i++) await vote(V(10 + Math.floor(i / 59)), "198.51.100.8");
    const results = await Promise.all([vote(V(1), "198.51.100.8"), vote(V(2), "198.51.100.8")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await count()).toBe(150);
  });
});

describe("cleanup (AC-15)", () => {
  it("deletes rows from before the previous hour and keeps the current and previous hour", async () => {
    const row = (start: number) => ({
      kind: "vote" as const,
      voterKey: V(9),
      ipKey: "x",
      windowStart: start,
    });
    const hour = windowStart(NOW);
    await db.insert(rateEvents).values([row(hour - 2 * HOUR_MS), row(hour - HOUR_MS), row(hour)]);
    await vote(V(1), "198.51.100.9");
    const starts = (await db.select().from(rateEvents)).map((r) => r.windowStart).sort();
    expect(starts).toEqual([hour - HOUR_MS, hour, hour]);
  });
  it("writes no row for a refused request", async () => {
    const before = await count();
    for (let i = 0; i < 60; i++) await vote(V(1), "198.51.100.10");
    await vote(V(1), "198.51.100.10");
    expect(await count()).toBe(before + 60);
  });
});

describe("burst limit and order (AC-1, AC-9)", () => {
  const deny: Limiter = { limit: () => Promise.resolve({ success: false }) };
  it("refuses a post over the burst limit without calling siteverify or using an hourly slot", async () => {
    const fetcher = vi.fn(okFetch);
    expect(await post(V(1), "198.51.100.11", { limiter: deny, fetch: fetcher })).toEqual({
      ok: false,
      code: "rate_limited",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });
  it("keys the burst limiter by the address hash, never the address", async () => {
    const limit = vi.fn(() => Promise.resolve({ success: true }));
    await post(V(1), "198.51.100.12", { limiter: { limit } });
    const first = limit.mock.calls[0] as unknown as [{ key: string }];
    expect(first[0].key).toBe(await ipKey("198.51.100.12", SALT));
  });
  it("refuses a vote over the burst limit and writes nothing", async () => {
    expect(await vote(V(1), "198.51.100.13", { limiter: deny })).toEqual({
      ok: false,
      code: "rate_limited",
    });
    expect(await count()).toBe(0);
  });
  it("a bad or missing token never uses an hourly slot and gives challenge_failed", async () => {
    const reject = () =>
      Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 200 }));
    expect(await post(V(1), "198.51.100.14", { fetch: reject })).toEqual({
      ok: false,
      code: "challenge_failed",
    });
    expect(
      await checkPost(
        { voterId: V(1), ip: "198.51.100.14" },
        { db, limiter: allow, fetch: okFetch, now: NOW, salt: SALT },
      ),
    ).toEqual({ ok: false, code: "challenge_failed" });
    expect(await count()).toBe(0);
  });
});

describe("failing open (AC-10)", () => {
  it("keeps the refusal when only the reason lookup fails", async () => {
    for (let i = 0; i < LIMITS.post.voter; i++) await post(V(1), "198.51.100.40");
    const client = db.$client;
    const flaky = new Proxy(db, {
      get(target, prop) {
        if (prop !== "$client") return Reflect.get(target, prop) as unknown;
        return new Proxy(client, {
          get(c, name) {
            if (name === "prepare")
              return (sql: string) => {
                if (/^\s*select count/i.test(sql)) throw new Error("lookup down");
                return c.prepare(sql);
              };
            const value = Reflect.get(c, name) as unknown;
            return typeof value === "function" ? (value as () => unknown).bind(c) : value;
          },
        });
      },
    });
    expect(await post(V(1), "198.51.100.40", { db: flaky })).toEqual({
      ok: false,
      code: "rate_limited",
    });
  });
  it("skips the burst limit when the binding throws or is missing, and logs one degraded line", async () => {
    const boom: Limiter = { limit: () => Promise.reject(new TypeError("secret detail")) };
    expect((await post(V(1), "198.51.100.15", { limiter: boom })).ok).toBe(true);
    expect((await post(V(2), "198.51.100.15", { limiter: null })).ok).toBe(true);
    const degraded = logs
      .map((l) => JSON.parse(l) as Record<string, string>)
      .filter((l) => l.reason === "binding_error");
    expect(degraded).toHaveLength(2);
    expect(degraded[0]).toMatchObject({
      event: "abuse_degraded",
      kind: "post",
      errorName: "TypeError",
    });
    expect(logs.join()).not.toContain("secret detail");
  });
  it("allows the request when the D1 hourly statement fails", async () => {
    const broken = {
      $client: {
        prepare: () => {
          throw new Error("d1 down");
        },
      },
    } as unknown as Db;
    expect((await post(V(1), "198.51.100.16", { db: broken })).ok).toBe(true);
    expect(logs.some((l) => l.includes('"reason":"counter_error"'))).toBe(true);
  });
  it("without a salt runs only the browser count, never the none key, and logs not_configured", async () => {
    for (let i = 0; i < 5; i++)
      expect((await post(V(400 + i), "198.51.100.17", { salt: null })).ok).toBe(true);
    expect((await post(V(400), "198.51.100.17", { salt: null })).ok).toBe(true);
    for (let i = 0; i < 4; i++) await post(V(400), "198.51.100.17", { salt: null });
    expect((await post(V(400), "198.51.100.17", { salt: null })).ok).toBe(false);
    expect(logs.some((l) => l.includes('"reason":"not_configured"'))).toBe(true);
    const keys = (await db.select().from(rateEvents)).map((r) => r.ipKey);
    expect(keys).not.toContain("none");
  });
  it("still runs the bot check when the counters fail", async () => {
    const reject = () =>
      Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 200 }));
    expect(await post(V(1), "198.51.100.18", { salt: null, limiter: null, fetch: reject })).toEqual(
      {
        ok: false,
        code: "challenge_failed",
      },
    );
  });
});

describe("logs (AC-6)", () => {
  it("holds only the listed keys and never the address, hash, salt or full voter id", async () => {
    for (let i = 0; i < 6; i++) await post(V(1), "198.51.100.19");
    const refused = logs.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(refused).toHaveLength(1);
    expect(Object.keys(refused[0] ?? {}).sort()).toEqual(["event", "kind", "reason", "voter8"]);
    expect(refused[0]).toMatchObject({
      event: "abuse_refused",
      kind: "post",
      reason: "hourly_voter",
    });
    const all = logs.join();
    for (const secret of ["198.51.100.19", SALT, await ipKey("198.51.100.19", SALT), V(1)]) {
      expect(all).not.toContain(secret);
    }
  });
  it("names the address cap when that one is reached", async () => {
    for (let i = 0; i < 15; i++) await post(V(600 + i), "198.51.100.20");
    logs.length = 0;
    await post(V(700), "198.51.100.20");
    expect(logs[0]).toContain('"reason":"hourly_ip"');
  });
});
