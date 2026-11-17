// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAdminPath, ADMIN_REFUSAL_TEXT } from "@/lib/admin-refusal";

import { middleware } from "./middleware";

vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers()) }));

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    logs.push(String(line));
  });
  vi.stubGlobal("fetch", () => Promise.reject(new Error("no network in tests")));
  vi.stubEnv("ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
  vi.stubEnv("ACCESS_AUD", "aud-1");
  vi.stubEnv("ADMIN_EMAIL", "admin@x.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isAdminPath", () => {
  it("matches /admin however it is written", () => {
    for (const path of [
      "/admin",
      "/admin/",
      "/admin/x",
      "/%61dmin",
      "/Admin",
      "//admin",
      "/%41DMIN/x",
    ]) {
      expect({ path, hit: isAdminPath(path) }).toEqual({ path, hit: true });
    }
  });

  it("leaves other paths alone", () => {
    for (const path of ["/", "/administrator", "/api/admin-x", "/x/admin"]) {
      expect({ path, hit: isAdminPath(path) }).toEqual({ path, hit: false });
    }
  });
});

describe("middleware on /admin", () => {
  it("answers 403 with the plain page and the no store, noindex and CSP headers", async () => {
    const response = await middleware(new NextRequest("http://localhost/admin"));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("content-security-policy")).toMatch(/nonce-/);
    expect(response.headers.get("location")).toBeNull();
    const body = await response.text();
    expect(body).toContain(ADMIN_REFUSAL_TEXT);
    expect(body).not.toMatch(/<script|<form|<input/);
  });

  it("gives every variant of the path the same 403", async () => {
    for (const path of ["/admin/", "/%61dmin", "/admin?_rsc=x", "/admin/anything"]) {
      const response = await middleware(new NextRequest(`http://localhost${path}`));
      expect({ path, status: response.status }).toEqual({ path, status: 403 });
    }
    const rsc = await middleware(
      new NextRequest("http://localhost/admin", { headers: { RSC: "1" } }),
    );
    expect(rsc.status).toBe(403);
  });

  it("logs only the event, surface and reason", async () => {
    await middleware(
      new NextRequest("http://localhost/admin", {
        headers: { "cf-access-jwt-assertion": "not.a.jwt" },
      }),
    );
    const entries = logs.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(entries).toEqual([
      { event: "admin_refused", surface: "middleware", reason: "keys_unavailable" },
    ]);
    expect(logs.join(" ")).not.toContain("not.a.jwt");
  });

  it("refuses when Access is not configured", async () => {
    vi.stubEnv("ACCESS_AUD", "");
    const response = await middleware(new NextRequest("http://localhost/admin"));
    expect(response.status).toBe(403);
    expect(logs[0]).toContain("not_configured");
  });

  it("leaves the public board alone", async () => {
    const response = await middleware(new NextRequest("http://localhost/"));
    expect(response.status).toBe(200);
    expect(logs).toEqual([]);
  });
});

describe("middleware voter cookie (AC-9)", () => {
  const cookie = (response: Response) => response.headers.get("set-cookie") ?? "";

  it("sets the voter cookie on a page GET, Secure on a normal host", async () => {
    const response = await middleware(new NextRequest("https://next-build.example/"));
    expect(cookie(response)).toMatch(/nb_voter=[0-9a-f-]{36}/);
    expect(cookie(response)).toMatch(/secure/i);
    expect(cookie(response)).toMatch(/httponly/i);
  });

  it("sets it on an RSC GET too", async () => {
    const response = await middleware(
      new NextRequest("https://next-build.example/", { headers: { RSC: "1" } }),
    );
    expect(cookie(response)).toMatch(/nb_voter=/);
  });

  it("is not Secure on localhost or 127.0.0.1", async () => {
    for (const host of ["http://localhost:3000/", "http://127.0.0.1:3000/"]) {
      const response = await middleware(new NextRequest(host));
      expect(cookie(response)).toMatch(/nb_voter=/);
      expect(cookie(response)).not.toMatch(/secure/i);
    }
  });

  it("keeps a valid cookie and replaces a garbage one", async () => {
    const valid = "11111111-1111-4111-8111-111111111111";
    const kept = await middleware(
      new NextRequest("https://next-build.example/", { headers: { cookie: `nb_voter=${valid}` } }),
    );
    expect(cookie(kept)).not.toMatch(/nb_voter=/);
    const replaced = await middleware(
      new NextRequest("https://next-build.example/", { headers: { cookie: "nb_voter=garbage" } }),
    );
    expect(cookie(replaced)).toMatch(/nb_voter=[0-9a-f-]{36}/);
  });
});
