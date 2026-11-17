// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listSpy, hideSpy, headerStore } = vi.hoisted(() => ({
  listSpy: vi.fn(),
  hideSpy: vi.fn(),
  headerStore: { current: new Headers() },
}));

vi.mock("next/headers", () => ({ headers: () => Promise.resolve(headerStore.current) }));
vi.mock("@/db/admin-queries", () => ({ listIdeasForAdmin: listSpy, setIdeaHidden: hideSpy }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));

import { setHidden } from "./actions";

const IDEA = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  listSpy.mockReset();
  hideSpy.mockReset();
  headerStore.current = new Headers();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("setHidden", () => {
  it("answers forbidden first, before it reads the input, and writes nothing", async () => {
    expect(await setHidden({ ideaId: IDEA, hidden: true })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await setHidden("garbage")).toEqual({ ok: false, code: "forbidden" });
    expect(hideSpy).not.toHaveBeenCalled();
  });

  it("refuses a token in the cookie only", async () => {
    headerStore.current = new Headers({ cookie: "CF_Authorization=abc" });
    expect(await setHidden({ ideaId: IDEA, hidden: true })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(hideSpy).not.toHaveBeenCalled();
  });
});

describe("setHidden as the admin", () => {
  async function signIn(): Promise<void> {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
    vi.stubEnv("APP_ENV", "preview");
    vi.stubEnv("ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
    vi.stubEnv("ACCESS_AUD", "aud-1");
    vi.stubEnv("ADMIN_EMAIL", "admin@x.test");
    vi.stubEnv("ACCESS_LOCAL_JWKS", JSON.stringify({ keys: [jwk] }));
    const token = await new SignJWT({ email: "admin@x.test" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("https://team.cloudflareaccess.com")
      .setAudience("aud-1")
      .setExpirationTime("5m")
      .sign(privateKey);
    headerStore.current = new Headers({ "cf-access-jwt-assertion": token });
  }

  afterEach(() => vi.unstubAllEnvs());

  it("writes with the proof and reports the new state", async () => {
    await signIn();
    hideSpy.mockResolvedValue({ ok: true });
    expect(await setHidden({ ideaId: IDEA, hidden: true })).toEqual({ ok: true, hidden: true });
    expect(hideSpy).toHaveBeenCalledWith(expect.objectContaining({ email: "admin@x.test" }), {
      ideaId: IDEA,
      hidden: true,
    });
  });

  it("rejects bad input and maps not_found and failures", async () => {
    await signIn();
    expect(await setHidden({ ideaId: "nope", hidden: true })).toEqual({
      ok: false,
      code: "invalid",
    });
    hideSpy.mockResolvedValueOnce({ ok: false, code: "not_found" });
    expect(await setHidden({ ideaId: IDEA, hidden: false })).toEqual({
      ok: false,
      code: "not_found",
    });
    hideSpy.mockRejectedValueOnce(new Error("db down"));
    expect(await setHidden({ ideaId: IDEA, hidden: false })).toEqual({ ok: false, code: "server" });
  });

  it("never logs the email", async () => {
    await signIn();
    hideSpy.mockResolvedValue({ ok: true });
    await setHidden({ ideaId: IDEA, hidden: true });
    const logged = vi.mocked(console.log).mock.calls.flat().join(" ");
    expect(logged).toContain("admin_set_hidden");
    expect(logged).not.toContain("admin@x.test");
  });
});

describe("guard coverage", () => {
  const root = join(process.cwd(), "src");
  const files = sourceFiles(root).filter((file) => {
    const text = readFileSync(file, "utf8");
    return /^["']use server["']/m.test(text) && /admin-queries/.test(text);
  });

  it("finds the admin action file", () => {
    expect(files.map((f) => f.slice(root.length + 1))).toContain(
      join("app", "admin", "actions.ts"),
    );
  });

  it("every server action that uses admin queries refuses with no admin and touches nothing", async () => {
    for (const file of files) {
      const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
      for (const [name, exported] of Object.entries(mod)) {
        if (typeof exported !== "function") continue;
        for (const input of [undefined, null, "x", {}, { ideaId: IDEA, hidden: true }]) {
          const result: unknown = await (exported as (input: unknown) => Promise<unknown>)(input);
          expect({ file, name, result }).toEqual({
            file,
            name,
            result: { ok: false, code: "forbidden" },
          });
        }
      }
    }
    expect(listSpy).not.toHaveBeenCalled();
    expect(hideSpy).not.toHaveBeenCalled();
  });
});
