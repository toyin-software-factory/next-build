"use server";

import { headers } from "next/headers";

import { insertIdea } from "@/db/queries";
import { checkPost } from "@/lib/abuse";
import { getVoterId } from "@/lib/voter";
import { parseIdeaText, postIdeaInputSchema } from "@/lib/schemas";
import type { PostErrorCode } from "@/lib/copy";
import { logPost } from "@/lib/log";

export type PostResult = { ok: true } | { ok: false; code: PostErrorCode; over?: number };

/** Adds one idea (spec 0004). Order: voter, parse, abuse check, insert, log, result. */
export async function postIdea(input: unknown): Promise<PostResult> {
  const voterId = await getVoterId();
  if (voterId === null) {
    logPost({ event: "idea_refused", code: "no_voter", voterId: null });
    return { ok: false, code: "no_voter" };
  }

  const parsedInput = postIdeaInputSchema.safeParse(input);
  if (!parsedInput.success) {
    logPost({ event: "idea_refused", code: "invalid", voterId });
    return { ok: false, code: "invalid" };
  }
  const parsed = parseIdeaText(parsedInput.data.text);
  if (!parsed.ok) {
    logPost({ event: "idea_refused", code: parsed.code, voterId });
    return { ok: false, code: parsed.code, over: parsed.over };
  }

  const ip = (await headers()).get("cf-connecting-ip");
  const check = await checkPost({ voterId, ip });
  if (!check.ok) {
    logPost({ event: "idea_refused", code: check.code, voterId });
    return { ok: false, code: check.code };
  }

  try {
    await insertIdea({
      id: parsedInput.data.submissionId,
      text: parsed.text,
      authorVoterId: voterId,
      createdAt: new Date(Date.now()),
      hiddenAt: null,
    });
  } catch (error) {
    logPost({
      event: "idea_post_failed",
      code: "server",
      voterId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, code: "server" };
  }
  logPost({ event: "idea_posted", code: "ok", voterId });
  return { ok: true };
}
