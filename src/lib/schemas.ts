import { z } from "zod";

import { MAX_IDEA_LENGTH, ideaLength, normalizeIdea } from "./idea";

export const MAX_RAW_LENGTH = 2000;

export const postIdeaInputSchema = z.object({
  submissionId: z.uuid(),
  text: z.string(),
  token: z.string().min(1).max(2048).optional(),
});

export type ParsedIdea =
  | { ok: true; text: string }
  | { ok: false; code: "empty" | "too_long" | "raw_too_long"; over: number };

/** Raw cap first (cheap guard), then normalize and check 1 to MAX_IDEA_LENGTH code points. */
export function parseIdeaText(raw: string): ParsedIdea {
  if (raw.length > MAX_RAW_LENGTH) return { ok: false, code: "raw_too_long", over: 0 };
  const text = normalizeIdea(raw);
  const length = ideaLength(text);
  if (length === 0) return { ok: false, code: "empty", over: 0 };
  if (length > MAX_IDEA_LENGTH)
    return { ok: false, code: "too_long", over: length - MAX_IDEA_LENGTH };
  return { ok: true, text };
}

export const setVoteInputSchema = z.object({
  ideaId: z.uuid(),
  want: z.enum(["on", "off"]),
});

export const VOTE_ERROR_CODES = [
  "invalid",
  "no_voter",
  "idea_unavailable",
  "rate_limited",
  "server",
] as const;

export type VoteErrorCode = (typeof VOTE_ERROR_CODES)[number];

export type VoteResult =
  { ok: true; count: number; voted: boolean } | { ok: false; code: VoteErrorCode };

const voteResultSchema = z.union([
  z.object({ ok: z.literal(true), count: z.number().int().min(0), voted: z.boolean() }),
  z.object({ ok: z.literal(false), code: z.enum(VOTE_ERROR_CODES) }),
]);

/** What the client does with an answer it cannot trust: anything that is not a VoteResult is `server`. */
export function readVoteResult(value: unknown): VoteResult {
  const parsed = voteResultSchema.safeParse(value);
  return parsed.success ? parsed.data : { ok: false, code: "server" };
}
