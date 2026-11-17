import type { NextRequest, NextResponse } from "next/server";

import { VOTER_COOKIE, isVoterId } from "./voter-id";

const FOUR_HUNDRED_DAYS = 400 * 24 * 60 * 60;

/** On any GET without a valid nb_voter, sets a new random one (spec 0002, 0004). Actions never do this. */
export function ensureVoterCookie(request: NextRequest, response: NextResponse): void {
  if (request.method !== "GET") return;
  if (isVoterId(request.cookies.get(VOTER_COOKIE)?.value)) return;
  const { hostname } = request.nextUrl;
  response.cookies.set(VOTER_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: FOUR_HUNDRED_DAYS,
    secure: hostname !== "localhost" && hostname !== "127.0.0.1",
  });
}
