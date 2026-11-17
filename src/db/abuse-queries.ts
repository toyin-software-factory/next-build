import "server-only";

import type { Db } from "./queries";
import { getDb } from "./client";

export const HOUR_MS = 3_600_000;

/** Start of the clock hour that contains `now`, in ms (spec 0007). */
export function windowStart(now: number): number {
  return Math.floor(now / HOUR_MS) * HOUR_MS;
}

export type HourlySlot = {
  kind: "post" | "vote";
  voterKey: string;
  ipKey: string;
  voterLimit: number;
  ipLimit: number;
  now: number;
};

/**
 * One atomic statement: records the request only when both the browser count and the address count
 * are below their caps, so two parallel requests cannot both take the last slot and a refused request
 * writes nothing. True when the row was added.
 */
export async function takeHourlySlot(slot: HourlySlot, db: Db = getDb()): Promise<boolean> {
  const result = await db.$client
    .prepare(
      `insert into rate_events (kind, voter_key, ip_key, window_start)
       select ?1, ?2, ?3, ?4
       where (select count(*) from rate_events where kind = ?1 and voter_key = ?2 and window_start = ?4) < ?5
         and (select count(*) from rate_events where kind = ?1 and ip_key = ?3 and window_start = ?4) < ?6
       returning 1`,
    )
    .bind(
      slot.kind,
      slot.voterKey,
      slot.ipKey,
      windowStart(slot.now),
      slot.voterLimit,
      slot.ipLimit,
    )
    .all();
  return result.results.length === 1;
}

/** Per browser only, for when the address key is unavailable (no salt): the address cap is not checked. */
export async function takeVoterOnlySlot(
  slot: Omit<HourlySlot, "ipKey" | "ipLimit">,
  db: Db = getDb(),
): Promise<boolean> {
  return takeHourlySlot({ ...slot, ipKey: "unsalted", ipLimit: Number.MAX_SAFE_INTEGER }, db);
}

/** Deletes rows from before the previous hour. Called after an allowed request. */
export async function deleteOldEvents(now: number, db: Db = getDb()): Promise<void> {
  await db.$client
    .prepare("delete from rate_events where window_start < ?1")
    .bind(windowStart(now) - HOUR_MS)
    .run();
}

/** Which cap a refused request hit. Only called after a refusal, for the log reason. */
export async function reachedCap(
  slot: Pick<HourlySlot, "kind" | "voterKey" | "voterLimit" | "now">,
  db: Db = getDb(),
): Promise<"hourly_voter" | "hourly_ip"> {
  const row = await db.$client
    .prepare(
      "select count(*) as n from rate_events where kind = ?1 and voter_key = ?2 and window_start = ?3",
    )
    .bind(slot.kind, slot.voterKey, windowStart(slot.now))
    .first<{ n: number }>();
  return (row?.n ?? 0) >= slot.voterLimit ? "hourly_voter" : "hourly_ip";
}
