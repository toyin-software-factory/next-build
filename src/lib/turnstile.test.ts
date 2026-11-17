// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./env", async (original) => ({
  ...(await original<typeof import("./env")>()),
  getTurnstileSecret: () => Promise.resolve(secret.value),
}));
const secret = vi.hoisted((): { value: string | null } => ({ value: "test-secret" }));

import { verifyTurnstile } from "./turnstile";

const answer =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
    );

afterEach(() => {
  vi.unstubAllEnvs();
  secret.value = "test-secret";
});

describe("verifyTurnstile (AC-8, AC-11)", () => {
  it("makes no call for a missing, empty or oversize token", async () => {
    const fetcher = vi.fn(answer({ success: true }));
    for (const token of [undefined, "", "x".repeat(2049)]) {
      expect(await verifyTurnstile({ token, ip: null, fetch: fetcher })).toEqual({
        ok: false,
        reason: "missing",
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends the secret, token and a valid address as a form, and accepts success", async () => {
    const fetcher = vi.fn(answer({ success: true }));
    expect(await verifyTurnstile({ token: "tok", ip: "203.0.113.5", fetch: fetcher })).toEqual({
      ok: true,
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, { body: URLSearchParams }];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.body.get("secret")).toBe("test-secret");
    expect(init.body.get("response")).toBe("tok");
    expect(init.body.get("remoteip")).toBe("203.0.113.5");
  });
  it("leaves out remoteip for a malformed address", async () => {
    const fetcher = vi.fn(answer({ success: true }));
    await verifyTurnstile({ token: "tok", ip: "garbage", fetch: fetcher });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, { body: URLSearchParams }];
    expect(init.body.has("remoteip")).toBe(false);
  });
  it("refuses success false as rejected, and internal-error as unavailable", async () => {
    expect(
      await verifyTurnstile({
        token: "t",
        ip: null,
        fetch: answer({ success: false, "error-codes": ["invalid-input-response"] }),
      }),
    ).toEqual({ ok: false, reason: "rejected" });
    expect(
      await verifyTurnstile({
        token: "t",
        ip: null,
        fetch: answer({ success: false, "error-codes": ["internal-error"] }),
      }),
    ).toEqual({ ok: false, reason: "unavailable" });
  });
  it("fails closed on a timeout, a 500, bad JSON, a wrong shape and a thrown error", async () => {
    const cases = [
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
      answer({}, 500),
      answer("not json"),
      answer({ nope: true }),
      () => Promise.reject(new TypeError("network")),
    ];
    for (const fetcher of cases) {
      expect(await verifyTurnstile({ token: "t", ip: null, fetch: fetcher })).toEqual({
        ok: false,
        reason: "unavailable",
      });
    }
  });
  it("in production also needs the action post_idea and the site hostname", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://next-build.example.workers.dev");
    const good = { success: true, action: "post_idea", hostname: "next-build.example.workers.dev" };
    expect(await verifyTurnstile({ token: "t", ip: null, fetch: answer(good) })).toEqual({
      ok: true,
    });
    expect(
      await verifyTurnstile({ token: "t", ip: null, fetch: answer({ ...good, action: "other" }) }),
    ).toEqual({ ok: false, reason: "rejected" });
    expect(
      await verifyTurnstile({
        token: "t",
        ip: null,
        fetch: answer({ ...good, hostname: "evil.example" }),
      }),
    ).toEqual({ ok: false, reason: "rejected" });
  });
  it("outside production ignores action and hostname (test keys return a fake hostname)", async () => {
    vi.stubEnv("APP_ENV", "preview");
    expect(
      await verifyTurnstile({
        token: "t",
        ip: null,
        fetch: answer({ success: true, hostname: "example.com" }),
      }),
    ).toEqual({ ok: true });
  });
  it("in production refuses as not_configured without a site URL or a secret, without calling Cloudflare", async () => {
    vi.stubEnv("APP_ENV", "production");
    const fetcher = vi.fn(answer({ success: true }));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(await verifyTurnstile({ token: "t", ip: null, fetch: fetcher })).toEqual({
      ok: false,
      reason: "not_configured",
    });
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://next-build.example.workers.dev");
    secret.value = null;
    expect(await verifyTurnstile({ token: "t", ip: null, fetch: fetcher })).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
