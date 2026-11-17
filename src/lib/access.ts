import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import type { JSONWebKeySet, JWK } from "jose";
import { headers as requestHeaders } from "next/headers";
import { z } from "zod";

import { getAppEnv } from "./env";

/** Why a request was not let into /admin. Logged as a code only, never shown with detail. */
export type AccessRefusal =
  "not_configured" | "no_token" | "invalid_token" | "wrong_email" | "keys_unavailable";

export type AccessResult = { ok: true; email: string } | { ok: false; reason: AccessRefusal };

export type AccessConfig = {
  teamDomain: string;
  audience: string;
  adminEmail: string;
};

const TEAM_DOMAIN = /^[a-z0-9-]+\.cloudflareaccess\.com$/;
const CLOCK_TOLERANCE_SECONDS = 30;
const CERTS_TIMEOUT_MS = 5000;

/** True when the string holds an ASCII control character (below 0x20, or 0x7f). */
function hasControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Reads the three Access settings. Any missing or malformed one means no admin (fails closed). */
export function readAccessConfig(
  source: Record<string, string | undefined> = process.env,
): AccessConfig | null {
  const teamDomain = (source.ACCESS_TEAM_DOMAIN ?? "").trim().toLowerCase();
  const audience = (source.ACCESS_AUD ?? "").trim();
  const adminEmail = (source.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!TEAM_DOMAIN.test(teamDomain) || audience === "" || adminEmail === "") return null;
  return { teamDomain, audience, adminEmail };
}

const keySetSchema = z.object({ keys: z.array(z.record(z.string(), z.unknown())) });

let cachedKeys: { teamDomain: string; keys: JWK[] } | null = null;

/** Test only: forget the cached key list. */
export function resetAccessKeyCache(): void {
  cachedKeys = null;
}

function hasKid(keys: readonly JWK[], kid: string): boolean {
  return keys.some((key) => key.kid === kid);
}

async function fetchKeys(teamDomain: string): Promise<JWK[] | null> {
  try {
    const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
      signal: AbortSignal.timeout(CERTS_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = keySetSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.keys.length === 0) return null;
    return parsed.data.keys;
  } catch {
    return null;
  }
}

/**
 * The team's public signing keys. Only the parsed key list is cached (a module variable): never a
 * fetch or a Response, which Workers forbids sharing between requests. A kid that is not cached
 * triggers one refetch (key rotation). A failed fetch leaves the cache as it was.
 */
export async function getAccessKeys(
  teamDomain: string,
  options: { missingKid?: string } = {},
): Promise<JWK[] | null> {
  const current = cachedKeys?.teamDomain === teamDomain ? cachedKeys.keys : null;
  const needsFetch =
    current === null || (options.missingKid !== undefined && !hasKid(current, options.missingKid));
  if (!needsFetch) return current;
  const fresh = await fetchKeys(teamDomain);
  if (fresh === null) return current;
  cachedKeys = { teamDomain, keys: fresh };
  return fresh;
}

/** Local development keys: only outside production and never behind Cloudflare's edge (no cf-ray). */
export function readLocalKeys(
  headers: Headers,
  source: Record<string, string | undefined> = process.env,
): JWK[] | null {
  if (getAppEnv() === "production") return null;
  if (headers.has("cf-ray")) return null;
  const raw = source.ACCESS_LOCAL_JWKS;
  if (raw === undefined || raw === "") return null;
  try {
    const parsed = keySetSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.keys : null;
  } catch {
    return null;
  }
}

function kidOf(token: string): string | undefined {
  try {
    return decodeProtectedHeader(token).kid;
  } catch {
    return undefined;
  }
}

const claimsSchema = z.object({
  email: z.string().optional(),
  type: z.string().optional(),
});

/**
 * Checks one Cf-Access-Jwt-Assertion value: config, token present, signature and claims against
 * the supplied keys, app (not service) token, and the one admin email. Pure given its inputs.
 */
export async function verifyAccessToken(
  token: string | null,
  config: AccessConfig | null,
  keys: readonly JWK[],
): Promise<AccessResult> {
  if (config === null) return { ok: false, reason: "not_configured" };
  if (token === null || token === "") return { ok: false, reason: "no_token" };
  if (keys.length === 0) return { ok: false, reason: "keys_unavailable" };

  let payload: unknown;
  try {
    const jwks: JSONWebKeySet = { keys: [...keys] };
    const verified = await jwtVerify(token, createLocalJWKSet(jwks), {
      issuer: `https://${config.teamDomain}`,
      audience: config.audience,
      algorithms: ["RS256"],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ["exp"],
    });
    payload = verified.payload;
  } catch {
    return { ok: false, reason: "invalid_token" };
  }

  const claims = claimsSchema.safeParse(payload);
  if (!claims.success) return { ok: false, reason: "invalid_token" };
  if (claims.data.type !== undefined && claims.data.type !== "app") {
    return { ok: false, reason: "invalid_token" };
  }
  const email = claims.data.email;
  if (email === undefined || hasControlChar(email)) return { ok: false, reason: "wrong_email" };
  if (email.trim().toLowerCase() !== config.adminEmail) return { ok: false, reason: "wrong_email" };
  return { ok: true, email: email.trim().toLowerCase() };
}

/**
 * The full check for one request's headers: finds the right keys (local test keys or the team's
 * published ones, refetching once for an unknown kid), then verifies. Only the header counts, never
 * the CF_Authorization cookie.
 */
export async function checkAccess(
  headers: Headers,
  config: AccessConfig | null = readAccessConfig(),
): Promise<AccessResult> {
  if (config === null) return { ok: false, reason: "not_configured" };
  const token = headers.get("cf-access-jwt-assertion");
  if (token === null || token === "") return { ok: false, reason: "no_token" };

  const local = readLocalKeys(headers);
  const keys = local ?? (await getAccessKeys(config.teamDomain, { missingKid: kidOf(token) }));
  if (keys === null) return { ok: false, reason: "keys_unavailable" };
  return verifyAccessToken(token, config, keys);
}

/** One structured line per refusal: the surface and reason only, never a token, email, IP or audience. */
export function logRefusal(surface: "middleware" | "page" | "action", reason: AccessRefusal): void {
  console.log(JSON.stringify({ event: "admin_refused", surface, reason }));
}

declare const adminBrand: unique symbol;

/**
 * Proof that this request came from the admin. Only requireAdmin() makes one (the one `as Admin`
 * in the codebase, enforced by ESLint), and every admin query takes it as a parameter.
 */
export type Admin = { readonly email: string; readonly [adminBrand]: true };

/** Checks the current request and returns the Admin proof, or null (and logs why, by surface). */
export async function requireAdmin(surface: "page" | "action"): Promise<Admin | null> {
  const result = await checkAccess(await requestHeaders());
  if (!result.ok) {
    logRefusal(surface, result.reason);
    return null;
  }
  return { email: result.email } as Admin;
}
