import { generateKeyPairSync, createPublicKey, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { SignJWT, importPKCS8 } from "jose";

/** Throwaway Access test identity shared by the web server (public half) and the tests (private half). */
export const E2E_ACCESS = {
  teamDomain: "e2e.cloudflareaccess.com",
  audience: "e2e-audience",
  adminEmail: "admin@example.test",
  kid: "e2e-key-1",
} as const;

const KEY_FILE = join(process.cwd(), ".wrangler", "e2e-access-key.json");

type StoredKey = { privatePem: string };

function pairToPem(): StoredKey {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { privatePem: privateKey.export({ type: "pkcs8", format: "pem" }) };
}

/**
 * One key per checkout, made on first use and kept in .wrangler (git ignored), so the config in the
 * main process and in each worker process agree, and a reused dev server keeps working.
 */
function loadStored(): StoredKey {
  if (!existsSync(KEY_FILE)) {
    mkdirSync(dirname(KEY_FILE), { recursive: true });
    writeFileSync(KEY_FILE, JSON.stringify(pairToPem()), { flag: "wx" });
  }
  return JSON.parse(readFileSync(KEY_FILE, "utf8")) as StoredKey;
}

function publicOf(privatePem: string): KeyObject {
  return createPublicKey(privatePem);
}

/** The public key set the Worker trusts locally (ACCESS_LOCAL_JWKS). */
export function e2ePublicKeySet(): string {
  const jwk = publicOf(loadStored().privatePem).export({ format: "jwk" });
  return JSON.stringify({ keys: [{ ...jwk, kid: E2E_ACCESS.kid, alg: "RS256", use: "sig" }] });
}

type SignOptions = { email?: string; audience?: string; privatePem?: string; expiresIn?: string };

/** Signs a token like the one Cloudflare Access adds, with the e2e key unless told otherwise. */
export async function signE2eToken(options: SignOptions = {}): Promise<string> {
  const pem = options.privatePem ?? loadStored().privatePem;
  const key = await importPKCS8(pem, "RS256");
  return new SignJWT({ email: options.email ?? E2E_ACCESS.adminEmail, type: "app" })
    .setProtectedHeader({ alg: "RS256", kid: E2E_ACCESS.kid })
    .setIssuer(`https://${E2E_ACCESS.teamDomain}`)
    .setAudience(options.audience ?? E2E_ACCESS.audience)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "2h")
    .sign(key);
}

/** A different private key, for the "signed by the wrong key" check. */
export function otherPrivatePem(): string {
  return pairToPem().privatePem;
}
