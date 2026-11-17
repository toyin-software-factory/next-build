export type PostCheckInput = {
  voterId: string;
  ip: string | null;
  token?: string;
};

export type PostCheck = { ok: true } | { ok: false; code: "rate_limited" | "challenge_failed" };

/** The seam for abuse protection (scope feature 9). A no op for now: it lets every post through. */
export const checkPost: (input: PostCheckInput) => Promise<PostCheck> = () =>
  Promise.resolve({ ok: true });

export type VoteCheckInput = { voterId: string; ip: string | null };

export type VoteCheck = { ok: true } | { ok: false; code: "rate_limited" };

/** The seam for vote limits (scope feature 9). A no op for now: it lets every vote through. */
export const checkVote: (input: VoteCheckInput) => Promise<VoteCheck> = () =>
  Promise.resolve({ ok: true });
