import { z } from "zod";

export const VOTER_COOKIE = "nb_voter";

const voterIdSchema = z.uuid();

/** True only for a UUID string. Anything else (garbage, arrays, undefined) is not a voter id. */
export function isVoterId(value: unknown): value is string {
  return voterIdSchema.safeParse(value).success;
}
