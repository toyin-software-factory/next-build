import { z } from "zod";

import { MAX_IDEA_LENGTH, ideaLength, normalizeIdea } from "./idea";

export const MAX_RAW_LENGTH = 2000;

export const postIdeaInputSchema = z.object({
  submissionId: z.uuid(),
  text: z.string(),
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
