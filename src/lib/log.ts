import { isVoterId } from "./voter-id";

type PostLog = {
  event: "idea_posted" | "idea_refused" | "idea_post_failed";
  code: string;
  voterId: string | null;
  errorName?: string;
};

/**
 * One structured line per post. Never the idea text, a full voter id, error.message or error.cause.
 * voter8 appears only when the id passed isVoterId, so a garbage cookie is never sliced into logs.
 */
export function logPost({ event, code, voterId, errorName }: PostLog): void {
  const entry = {
    event,
    code,
    ...(isVoterId(voterId) ? { voter8: voterId.slice(0, 8) } : {}),
    ...(errorName === undefined ? {} : { errorName }),
  };
  console.log(JSON.stringify(entry));
}

type VoteLog = {
  event: "vote_set" | "vote_refused" | "vote_failed";
  code: string;
  voterId: string | null;
  errorName?: string;
};

/** One structured line per vote, with the same rules as logPost: only event, code, voter8, errorName. */
export function logVote({ event, code, voterId, errorName }: VoteLog): void {
  const entry = {
    event,
    code,
    ...(isVoterId(voterId) ? { voter8: voterId.slice(0, 8) } : {}),
    ...(errorName === undefined ? {} : { errorName }),
  };
  console.log(JSON.stringify(entry));
}

type AbuseLog = {
  event: "abuse_refused" | "abuse_degraded";
  kind: "post" | "vote";
  reason:
    | "burst"
    | "hourly_voter"
    | "hourly_ip"
    | "challenge_missing"
    | "challenge_rejected"
    | "challenge_unavailable"
    | "counter_error"
    | "binding_error"
    | "not_configured";
  voterId: string | null;
  errorName?: string;
};

/**
 * One structured line per refused or degraded abuse check (spec 0007). Only event, kind, reason,
 * voter8 and errorName. Never the address, its hash, the salt, the token, error.message or the full voter id.
 */
export function logAbuse({ event, kind, reason, voterId, errorName }: AbuseLog): void {
  const entry = {
    event,
    kind,
    reason,
    ...(isVoterId(voterId) ? { voter8: voterId.slice(0, 8) } : {}),
    ...(errorName === undefined ? {} : { errorName }),
  };
  console.log(JSON.stringify(entry));
}
