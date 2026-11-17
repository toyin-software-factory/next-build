"use server";

import { headers } from "next/headers";

import { insertIdea, setVote as setVoteQuery } from "@/db/queries";
import { checkPost, checkVote } from "@/lib/abuse";
import { getVoterId } from "@/lib/voter";
import { parseIdeaText, postIdeaInputSchema, setVoteInputSchema } from "@/lib/schemas";
import type { VoteResult } from "@/lib/schemas";
import type { PostErrorCode } from "@/lib/copy";
import { logPost, logVote } from "@/lib/log";

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

/**
 * Puts the caller's vote on an idea into the wanted state (spec 0005). Order: voter, parse, abuse
 * check, write and read back, log, result. Repeating the same request gives the same result.
 */
export async function setVote(input: unknown): Promise<VoteResult> {
  const voterId = await getVoterId();
  if (voterId === null) {
    logVote({ event: "vote_refused", code: "no_voter", voterId: null });
    return { ok: false, code: "no_voter" };
  }

  const parsed = setVoteInputSchema.safeParse(input);
  if (!parsed.success) {
    logVote({ event: "vote_refused", code: "invalid", voterId });
    return { ok: false, code: "invalid" };
  }

  const ip = (await headers()).get("cf-connecting-ip");
  const check = await checkVote({ voterId, ip });
  if (!check.ok) {
    logVote({ event: "vote_refused", code: check.code, voterId });
    return { ok: false, code: check.code };
  }

  try {
    const result = await setVoteQuery({ ...parsed.data, voterId });
    if (!result.ok) {
      logVote({ event: "vote_refused", code: result.code, voterId });
      return result;
    }
    logVote({ event: "vote_set", code: "ok", voterId });
    return result;
  } catch (error) {
    logVote({
      event: "vote_failed",
      code: "server",
      voterId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, code: "server" };
  }
}
