// @vitest-environment node
import { Linter } from "eslint";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { JWK } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkAccess,
  getAccessKeys,
  readAccessConfig,
  readLocalKeys,
  resetAccessKeyCache,
  verifyAccessToken,
} from "./access";
import type { AccessConfig } from "./access";

const DOMAIN = "team.cloudflareaccess.com";
const config: AccessConfig = { teamDomain: DOMAIN, audience: "aud-1", adminEmail: "admin@x.test" };

type Pair = { privateKey: CryptoKey; jwk: JWK };

async function makePair(kid: string): Promise<Pair> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
  return { privateKey, jwk };
}

type TokenOptions = {
  kid?: string;
  aud?: string;
  iss?: string;
  email?: string | null;
  type?: string;
  exp?: number;
  nbf?: number;
};

async function sign(pair: Pair, options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {};
  if (options.email !== null) claims.email = options.email ?? "admin@x.test";
  if (options.type !== undefined) claims.type = options.type;
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: options.kid ?? pair.jwk.kid })
    .setIssuer(options.iss ?? `https://${DOMAIN}`)
    .setAudience(options.aud ?? "aud-1")
    .setExpirationTime(options.exp ?? now + 300);
  if (options.nbf !== undefined) jwt.setNotBefore(options.nbf);
  return jwt.sign(pair.privateKey);
}

let good: Pair;
let other: Pair;

beforeEach(async () => {
  good = await makePair("k1");
  other = await makePair("k2");
  resetAccessKeyCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verifyAccessToken", () => {
  it("accepts a valid app token for the admin", async () => {
    expect(await verifyAccessToken(await sign(good), config, [good.jwk])).toEqual({
      ok: true,
      email: "admin@x.test",
    });
  });

  it("ignores case and spaces in the email", async () => {
    const token = await sign(good, { email: " Admin@X.Test " });
    expect(await verifyAccessToken(token, config, [good.jwk])).toMatchObject({ ok: true });
  });

  it("refuses with each reason", async () => {
    const now = Math.floor(Date.now() / 1000);
    const cases: [string, Promise<string>, string][] = [
      ["wrong signature", sign(other, { kid: "k1" }), "invalid_token"],
      ["unknown key", sign(other), "invalid_token"],
      ["wrong audience", sign(good, { aud: "aud-2" }), "invalid_token"],
      ["wrong issuer", sign(good, { iss: "https://evil.cloudflareaccess.com" }), "invalid_token"],
      ["expired", sign(good, { exp: now - 600 }), "invalid_token"],
      ["not before", sign(good, { nbf: now + 600 }), "invalid_token"],
      ["service token (type)", sign(good, { type: "service" }), "invalid_token"],
      ["no email", sign(good, { email: null }), "wrong_email"],
      ["other email", sign(good, { email: "someone@x.test" }), "wrong_email"],
      ["control character", sign(good, { email: "admin@x.test\n" }), "wrong_email"],
    ];
    for (const [name, token, reason] of cases) {
      const result = await verifyAccessToken(await token, config, [good.jwk]);
      expect({ name, result }).toEqual({ name, result: { ok: false, reason } });
    }
  });

  it("refuses alg none and HS256", async () => {
    const header = Buffer.from('{"alg":"none"}').toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        iss: `https://${DOMAIN}`,
        aud: "aud-1",
        email: "admin@x.test",
        exp: 9999999999,
      }),
    ).toString("base64url");
    expect(await verifyAccessToken(`${header}.${body}.`, config, [good.jwk])).toEqual({
      ok: false,
      reason: "invalid_token",
    });
    const hs = await new SignJWT({ email: "admin@x.test" })
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setIssuer(`https://${DOMAIN}`)
      .setAudience("aud-1")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("secret-secret-secret-secret-secret"));
    expect(await verifyAccessToken(hs, config, [good.jwk])).toMatchObject({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("refuses when config, token or keys are missing", async () => {
    const token = await sign(good);
    expect(await verifyAccessToken(token, null, [good.jwk])).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(await verifyAccessToken(null, config, [good.jwk])).toEqual({
      ok: false,
      reason: "no_token",
    });
    expect(await verifyAccessToken("", config, [good.jwk])).toEqual({
      ok: false,
      reason: "no_token",
    });
    expect(await verifyAccessToken(token, config, [])).toEqual({
      ok: false,
      reason: "keys_unavailable",
    });
  });

  it("keeps two apps apart by audience (AC-9)", async () => {
    const token = await sign(good, { aud: "aud-1" });
    const second: AccessConfig = { ...config, audience: "aud-2" };
    expect(await verifyAccessToken(token, config, [good.jwk])).toMatchObject({ ok: true });
    expect(await verifyAccessToken(token, second, [good.jwk])).toMatchObject({ ok: false });
  });
});

describe("readAccessConfig", () => {
  it("needs a valid team domain, audience and email", () => {
    const ok = { ACCESS_TEAM_DOMAIN: DOMAIN, ACCESS_AUD: "a", ADMIN_EMAIL: "A@x.test" };
    expect(readAccessConfig(ok)).toEqual({
      teamDomain: DOMAIN,
      audience: "a",
      adminEmail: "a@x.test",
    });
    expect(readAccessConfig({ ...ok, ACCESS_TEAM_DOMAIN: "" })).toBeNull();
    expect(readAccessConfig({ ...ok, ACCESS_TEAM_DOMAIN: "evil.example.com" })).toBeNull();
    expect(
      readAccessConfig({ ...ok, ACCESS_TEAM_DOMAIN: "a.cloudflareaccess.com.evil.io" }),
    ).toBeNull();
    expect(readAccessConfig({ ...ok, ACCESS_AUD: "" })).toBeNull();
    expect(readAccessConfig({ ...ok, ADMIN_EMAIL: " " })).toBeNull();
  });
});

function certsResponse(keys: JWK[]): Response {
  return new Response(JSON.stringify({ keys }), { status: 200 });
}

describe("getAccessKeys", () => {
  it("fetches once and serves the cache", async () => {
    const fetchMock = vi
      .fn<(url: string) => Promise<Response>>()
      .mockImplementation(() => Promise.resolve(certsResponse([good.jwk])));
    vi.stubGlobal("fetch", fetchMock);
    await getAccessKeys(DOMAIN);
    await getAccessKeys(DOMAIN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://${DOMAIN}/cdn-cgi/access/certs`);
  });

  it("refetches exactly once for an unknown kid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(certsResponse([good.jwk]))
      .mockResolvedValue(certsResponse([good.jwk, other.jwk]));
    vi.stubGlobal("fetch", fetchMock);
    await getAccessKeys(DOMAIN);
    const keys = await getAccessKeys(DOMAIN, { missingKid: "k2" });
    expect(keys).toHaveLength(2);
    await getAccessKeys(DOMAIN, { missingKid: "k2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when the first fetch fails, then recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(certsResponse([good.jwk]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getAccessKeys(DOMAIN)).toBeNull();
    expect(await getAccessKeys(DOMAIN)).toHaveLength(1);
  });

  it("keeps the old keys when a refetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(certsResponse([good.jwk]))
      .mockResolvedValue(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await getAccessKeys(DOMAIN);
    expect(await getAccessKeys(DOMAIN, { missingKid: "zzz" })).toEqual([good.jwk]);
  });

  it("copes with a cold cache under concurrent requests", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(certsResponse([good.jwk])));
    const results = await Promise.all([getAccessKeys(DOMAIN), getAccessKeys(DOMAIN)]);
    expect(results.every((r) => r?.length === 1)).toBe(true);
  });
});

describe("checkAccess", () => {
  it("passes with the published keys and refuses when they cannot be fetched", async () => {
    const token = await sign(good);
    const headers = new Headers({ "cf-access-jwt-assertion": token });
    vi.stubGlobal("fetch", () => Promise.resolve(certsResponse([good.jwk])));
    expect(await checkAccess(headers, config)).toMatchObject({ ok: true });

    resetAccessKeyCache();
    vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
    expect(await checkAccess(headers, config)).toEqual({ ok: false, reason: "keys_unavailable" });
  });

  it("ignores the CF_Authorization cookie", async () => {
    const token = await sign(good);
    vi.stubGlobal("fetch", () => Promise.resolve(certsResponse([good.jwk])));
    const headers = new Headers({ cookie: `CF_Authorization=${token}` });
    expect(await checkAccess(headers, config)).toEqual({ ok: false, reason: "no_token" });
  });

  it("refuses with no config before looking at anything else", async () => {
    expect(await checkAccess(new Headers(), null)).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
});

describe("local keys guard", () => {
  const env = { ACCESS_LOCAL_JWKS: JSON.stringify({ keys: [{ kty: "RSA", kid: "k1" }] }) };

  it("is honored outside production without cf-ray", () => {
    vi.stubEnv("APP_ENV", "preview");
    expect(readLocalKeys(new Headers(), env)).toHaveLength(1);
  });

  it("is ignored behind Cloudflare's edge (cf-ray)", () => {
    vi.stubEnv("APP_ENV", "preview");
    expect(readLocalKeys(new Headers({ "cf-ray": "abc" }), env)).toBeNull();
  });

  it("is ignored in production", () => {
    vi.stubEnv("APP_ENV", "production");
    expect(readLocalKeys(new Headers(), env)).toBeNull();
  });

  it("is ignored when malformed", () => {
    vi.stubEnv("APP_ENV", "preview");
    expect(readLocalKeys(new Headers(), { ACCESS_LOCAL_JWKS: "{nope" })).toBeNull();
  });
});

describe("Admin ESLint bans (spec 0006)", () => {
  /** Runs only the repo's two Admin rules on a virtual file at `filename`. */
  async function lint(filename: string, code: string): Promise<string[]> {
    const configPath = "../../eslint.config.mjs";
    const repoConfig = (
      (await import(/* @vite-ignore */ configPath)) as { default: Linter.Config[] }
    ).default;
    const { default: tseslint } = await import("typescript-eslint");
    const adminEntries = repoConfig.filter(
      (entry) =>
        entry.rules !== undefined &&
        Object.keys(entry.rules).some((rule) =>
          ["no-restricted-imports", "no-restricted-syntax"].includes(rule),
        ),
    );
    const messages = new Linter({ configType: "flat" }).verify(
      code,
      [
        {
          files: ["**/*.ts", "**/*.tsx"],
          languageOptions: { parser: tseslint.parser },
        },
        ...adminEntries,
      ],
      { filename },
    );
    return messages.map((m) => m.ruleId ?? `fatal: ${m.message}`);
  }

  const importQueries =
    'import { listIdeasForAdmin } from "@/db/admin-queries";\nvoid listIdeasForAdmin;\n';

  it("bans importing the admin queries from ordinary code", async () => {
    expect(await lint("src/app/actions.ts", importQueries)).toContain("no-restricted-imports");
    expect(await lint("src/components/Foo.tsx", importQueries)).toContain("no-restricted-imports");
    expect(await lint("src/db/queries.ts", 'import "./admin-queries";\n')).toContain(
      "no-restricted-imports",
    );
  });

  it("allows the admin route and the access module to import them", async () => {
    expect(await lint("src/app/admin/actions.ts", importQueries)).toEqual([]);
    expect(await lint("src/app/admin/page.tsx", importQueries)).toEqual([]);
    expect(await lint("src/lib/access.ts", importQueries)).toEqual([]);
  });

  it("bans building an Admin with a cast outside the access module", async () => {
    const asCast =
      'import type { Admin } from "@/lib/access";\nexport const a = { email: "x" } as Admin;\n';
    const angle =
      'import type { Admin } from "@/lib/access";\nexport const a = <Admin>{ email: "x" };\n';
    expect(await lint("src/app/admin/actions.ts", asCast)).toContain("no-restricted-syntax");
    expect(await lint("src/components/Foo.tsx", asCast)).toContain("no-restricted-syntax");
    expect(await lint("src/app/admin/actions.ts", angle)).toContain("no-restricted-syntax");
    expect(await lint("src/lib/access.ts", asCast)).toEqual([]);
  });
});
