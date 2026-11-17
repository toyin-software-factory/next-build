export type PostCheckInput = {
  voterId: string;
  ip: string | null;
  token?: string;
};

export type PostCheck = { ok: true } | { ok: false; code: "rate_limited" | "challenge_failed" };

/** The seam for abuse protection (scope feature 9). A no op for now: it lets every post through. */
export const checkPost: (input: PostCheckInput) => Promise<PostCheck> = () =>
  Promise.resolve({ ok: true });
