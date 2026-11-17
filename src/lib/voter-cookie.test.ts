import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { ensureVoterCookie } from "./voter-cookie";

const ID = "11111111-1111-4111-8111-111111111111";

function run(url: string, method = "GET", cookie?: string) {
  const request = new NextRequest(url, { method, headers: cookie ? { cookie } : {} });
  const response = NextResponse.next();
  ensureVoterCookie(request, response);
  return response.cookies.get("nb_voter");
}

describe("ensureVoterCookie", () => {
  it("sets a secure, http only, 400 day UUID cookie when missing", () => {
    const c = run("https://x.example/");
    expect(c?.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(c).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 34560000,
      secure: true,
    });
  });
  it("is not Secure on localhost", () => {
    expect(run("http://localhost:3000/")?.secure).toBe(false);
  });
  it("replaces a garbage cookie", () => {
    expect(run("https://x.example/", "GET", "nb_voter=not-a-uuid")?.value).not.toBe("not-a-uuid");
  });
  it("keeps a valid cookie", () => {
    expect(run("https://x.example/", "GET", `nb_voter=${ID}`)).toBeUndefined();
  });
  it("never sets one on a POST", () => {
    expect(run("https://x.example/", "POST")).toBeUndefined();
  });
});
