import "server-only";

import { cookies } from "next/headers";

import { VOTER_COOKIE, isVoterId } from "./voter-id";

export { VOTER_COOKIE, isVoterId };

/** The caller's voter id, or null. Never creates the cookie: only middleware does. */
export async function getVoterId(): Promise<string | null> {
  const value = (await cookies()).get(VOTER_COOKIE)?.value;
  return isVoterId(value) ? value : null;
}
