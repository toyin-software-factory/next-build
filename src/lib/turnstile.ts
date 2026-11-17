import "server-only";

import { z } from "zod";

import { getAppEnv, getSiteUrl, getTurnstileSecret, isSiteUrlConfigured } from "./env";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
export const TURNSTILE_ACTION = "post_idea";

/**
 * Why a token was not accepted. missing and rejected are Cloudflare or the visitor saying no.
 * unavailable and not_configured mean the check itself could not run (logged as degraded).
 */
export type TurnstileResult =
  { ok: true } | { ok: false; reason: "missing" | "rejected" | "unavailable" | "not_configured" };

const answerSchema = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).optional(),
  action: z.string().optional(),
  hostname: z.string().optional(),
});

export type TurnstileInput = {
  token: string | undefined;
  /** The raw address, sent only to Cloudflare as remoteip. Null when missing or malformed. */
  ip: string | null;
  fetch?: typeof fetch;
};

/** Checks one single use token with siteverify. Fails closed: anything unexpected is a refusal. */
export async function verifyTurnstile({
  token,
  ip,
  fetch: fetcher = fetch,
}: TurnstileInput): Promise<TurnstileResult> {
  const parsedToken = z.string().min(1).max(MAX_TOKEN_LENGTH).safeParse(token);
  if (!parsedToken.success) return { ok: false, reason: "missing" };

  const production = getAppEnv() === "production";
  if (production && !isSiteUrlConfigured()) return { ok: false, reason: "not_configured" };
  const secret = await getTurnstileSecret();
  if (secret === null) return { ok: false, reason: "not_configured" };

  try {
    const body = new URLSearchParams({ secret, response: parsedToken.data });
    if (ip !== null && (z.ipv4().safeParse(ip).success || z.ipv6().safeParse(ip).success)) {
      body.set("remoteip", ip);
    }
    const response = await fetcher(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const answer = answerSchema.safeParse(await response.json());
    if (!answer.success) return { ok: false, reason: "unavailable" };
    if (!answer.data.success) {
      return answer.data["error-codes"]?.includes("internal-error") === true
        ? { ok: false, reason: "unavailable" }
        : { ok: false, reason: "rejected" };
    }
    if (production) {
      const hostname = new URL(getSiteUrl()).hostname;
      if (answer.data.action !== TURNSTILE_ACTION || answer.data.hostname !== hostname) {
        return { ok: false, reason: "rejected" };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
