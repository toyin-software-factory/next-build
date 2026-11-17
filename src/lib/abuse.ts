import "server-only";

import { z } from "zod";

import { deleteOldEvents, reachedCap, takeHourlySlot, takeVoterOnlySlot } from "@/db/abuse-queries";
import type { Db } from "@/db/queries";

import { getAbuseSalt } from "./env";
import { logAbuse } from "./log";
import { verifyTurnstile } from "./turnstile";

/** The numbers in one place (spec 0007, D3). Burst limits live in wrangler.jsonc. */
export const LIMITS = {
  post: { voter: 5, ip: 15 },
  vote: { voter: 20, ip: 20 },
} as const;

type Kind = "post" | "vote";

/** The part of the Workers Rate Limiting binding that is used. */
export type Limiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

/** Everything the checks reach outside for. Production defaults apply to anything left out. */
export type AbuseDeps = {
  db?: Db;
  /** The burst limiter. Null means the binding is missing. */
  limiter?: Limiter | null;
  fetch?: typeof fetch;
  now?: number;
  /** The address salt. Null means it is not configured. */
  salt?: string | null;
};

const NONE_KEY = "none";
const HEX = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Eight 16 bit groups of a valid IPv6 address, with an embedded IPv4 tail turned into two groups. */
function expandV6(ip: string): string[] {
  let text = ip.toLowerCase();
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail?.[1] !== undefined) {
    const octets = tail[1].split(".").map(Number);
    const hi = (((octets[0] ?? 0) << 8) | (octets[1] ?? 0)).toString(16);
    const lo = (((octets[2] ?? 0) << 8) | (octets[3] ?? 0)).toString(16);
    text = `${text.slice(0, tail.index)}${hi}:${lo}`;
  }
  const [head = "", rest] = text.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = rest === undefined || rest === "" ? [] : rest.split(":");
  const fill = rest === undefined ? [] : Array<string>(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((g) => g.padStart(4, "0"));
}

/** The text that is hashed: the IPv4 address, or the first 64 bits of an IPv6 address. Null when not an address. */
export function addressKeyText(ip: string | null): string | null {
  if (ip === null) return null;
  if (z.ipv4().safeParse(ip).success) return `4:${ip}`;
  if (!z.ipv6().safeParse(ip).success) return null;
  const groups = expandV6(ip);
  const mapped =
    groups.slice(0, 5).every((g) => g === "0000") && groups[5] === "ffff" && groups.length === 8;
  if (mapped) {
    const hi = parseInt(groups[6] ?? "0", 16);
    const lo = parseInt(groups[7] ?? "0", 16);
    return `4:${String(hi >> 8)}.${String(hi & 255)}.${String(lo >> 8)}.${String(lo & 255)}`;
  }
  return `6:${groups.slice(0, 4).join(":")}`;
}

/**
 * The limit key for a client address: HMAC-SHA256 with the salt, first 16 bytes as hex. A missing or
 * malformed address is the shared key "none". The address itself is never kept.
 */
export async function ipKey(ip: string | null, salt: string): Promise<string> {
  const text = addressKeyText(ip);
  if (text === null) return NONE_KEY;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
  return HEX(new Uint8Array(mac).slice(0, 16));
}

async function defaultDb(): Promise<Db> {
  const { getDb } = await import("@/db/client");
  return getDb();
}

async function defaultLimiter(name: "POST_RATE_LIMITER" | "VOTE_RATE_LIMITER") {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const env = getCloudflareContext().env as Partial<Record<typeof name, Limiter>>;
  return env[name] ?? null;
}

type Common = { kind: Kind; voterId: string; ip: string | null };

type Outcome = { ok: true } | { ok: false; code: "rate_limited" };

/** The burst limit, keyed by the address hash. Skipped (and logged) when the binding fails or is missing. */
async function burst(
  { kind, voterId }: Common,
  key: string | null,
  deps: AbuseDeps,
): Promise<Outcome> {
  if (key === null) return { ok: true };
  try {
    const limiter =
      deps.limiter !== undefined
        ? deps.limiter
        : await defaultLimiter(kind === "post" ? "POST_RATE_LIMITER" : "VOTE_RATE_LIMITER");
    if (limiter === null) {
      logAbuse({ event: "abuse_degraded", kind, reason: "binding_error", voterId });
      return { ok: true };
    }
    const { success } = await limiter.limit({ key });
    if (success) return { ok: true };
    logAbuse({ event: "abuse_refused", kind, reason: "burst", voterId });
    return { ok: false, code: "rate_limited" };
  } catch (error) {
    logAbuse({
      event: "abuse_degraded",
      kind,
      reason: "binding_error",
      voterId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { ok: true };
  }
}

async function refusalReason(
  key: string | null,
  slot: Parameters<typeof reachedCap>[0],
  db: Db,
): Promise<"hourly_voter" | "hourly_ip"> {
  if (key === null) return "hourly_voter";
  try {
    return await reachedCap(slot, db);
  } catch {
    return "hourly_ip";
  }
}

/**
 * The hourly limit: one atomic statement checks the browser cap and the address cap and records the
 * request. Fails open when D1 errors. Without a salt only the browser cap runs.
 */
async function hourly(
  { kind, voterId }: Common,
  key: string | null,
  deps: AbuseDeps,
): Promise<Outcome> {
  const caps = LIMITS[kind];
  const now = deps.now ?? Date.now();
  try {
    const db = deps.db ?? (await defaultDb());
    const slot = { kind, voterKey: voterId, voterLimit: caps.voter, now };
    const allowed =
      key === null
        ? await takeVoterOnlySlot(slot, db)
        : await takeHourlySlot(
            { ...slot, ipKey: key, ipLimit: key === NONE_KEY ? caps.voter : caps.ip },
            db,
          );
    if (!allowed) {
      // The refusal stands even if the diagnostic lookup fails: only the quota statement fails open.
      const reason = await refusalReason(key, slot, db);
      logAbuse({ event: "abuse_refused", kind, reason, voterId });
      return { ok: false, code: "rate_limited" };
    }
    try {
      await deleteOldEvents(now, db);
    } catch (error) {
      logAbuse({
        event: "abuse_degraded",
        kind,
        reason: "counter_error",
        voterId,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
    return { ok: true };
  } catch (error) {
    logAbuse({
      event: "abuse_degraded",
      kind,
      reason: "counter_error",
      voterId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { ok: true };
  }
}

/** The address key, or null when no salt is configured (logged once, then the address limits are skipped). */
async function resolveKey(common: Common, deps: AbuseDeps): Promise<string | null> {
  const salt = deps.salt !== undefined ? deps.salt : await getAbuseSalt();
  if (salt === null) {
    logAbuse({
      event: "abuse_degraded",
      kind: common.kind,
      reason: "not_configured",
      voterId: common.voterId,
    });
    return null;
  }
  return ipKey(common.ip, salt);
}

export type PostCheckInput = {
  voterId: string;
  ip: string | null;
  token?: string;
};

export type PostCheck = { ok: true } | { ok: false; code: "rate_limited" | "challenge_failed" };

/**
 * Abuse checks for a post (spec 0007). Order: burst, Turnstile, hourly, so a bad token never uses an
 * hourly slot and a flood never reaches siteverify. The limits fail open, the bot check fails closed.
 */
export async function checkPost(input: PostCheckInput, deps: AbuseDeps = {}): Promise<PostCheck> {
  const common: Common = { kind: "post", voterId: input.voterId, ip: input.ip };
  const key = await resolveKey(common, deps);

  const limited = await burst(common, key, deps);
  if (!limited.ok) return limited;

  const bot = await verifyTurnstile({
    token: input.token,
    ip: input.ip,
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
  });
  if (!bot.ok) {
    logAbuse(
      bot.reason === "missing" || bot.reason === "rejected"
        ? {
            event: "abuse_refused",
            kind: "post",
            reason: bot.reason === "missing" ? "challenge_missing" : "challenge_rejected",
            voterId: input.voterId,
          }
        : {
            event: "abuse_degraded",
            kind: "post",
            reason: bot.reason === "unavailable" ? "challenge_unavailable" : "not_configured",
            voterId: input.voterId,
          },
    );
    return { ok: false, code: "challenge_failed" };
  }

  return hourly(common, key, deps);
}

export type VoteCheckInput = { voterId: string; ip: string | null };

export type VoteCheck = { ok: true } | { ok: false; code: "rate_limited" };

/** Abuse checks for a vote (spec 0007): burst, then hourly. Turnstile never applies to votes. */
export async function checkVote(input: VoteCheckInput, deps: AbuseDeps = {}): Promise<VoteCheck> {
  const common: Common = { kind: "vote", voterId: input.voterId, ip: input.ip };
  const key = await resolveKey(common, deps);
  const limited = await burst(common, key, deps);
  if (!limited.ok) return limited;
  return hourly(common, key, deps);
}
