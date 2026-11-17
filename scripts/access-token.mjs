// Prints a signed Access style token for local work (spec 0006).
// Usage: pnpm access:token  (needs ACCESS_TEAM_DOMAIN, ACCESS_AUD and ADMIN_EMAIL in .dev.vars)
// First run makes a throwaway key in .wrangler/local-access-key.json and prints the line to add to
// .dev.vars as ACCESS_LOCAL_JWKS. Then send the token as the Cf-Access-Jwt-Assertion header
// (for example with a header editor extension). It only works outside production and with no cf-ray.
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { SignJWT, importPKCS8 } from "jose";

const KEY_FILE = ".wrangler/local-access-key.json";
const KID = "local-key-1";

function readDevVars() {
  if (!existsSync(".dev.vars")) return {};
  return Object.fromEntries(
    readFileSync(".dev.vars", "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

if (!existsSync(KEY_FILE)) {
  mkdirSync(".wrangler", { recursive: true });
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(
    KEY_FILE,
    JSON.stringify({ pem: privateKey.export({ type: "pkcs8", format: "pem" }) }),
  );
}
const { pem } = JSON.parse(readFileSync(KEY_FILE, "utf8"));
const jwk = {
  ...createPublicKey(pem).export({ format: "jwk" }),
  kid: KID,
  alg: "RS256",
  use: "sig",
};
const vars = { ...readDevVars(), ...process.env };

const missing = ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ADMIN_EMAIL"].filter((name) => !vars[name]);
if (missing.length > 0) {
  console.error(`Set ${missing.join(", ")} in .dev.vars first.`);
  process.exit(1);
}

const key = await importPKCS8(pem, "RS256");
const token = await new SignJWT({ email: vars.ADMIN_EMAIL, type: "app" })
  .setProtectedHeader({ alg: "RS256", kid: KID })
  .setIssuer(`https://${vars.ACCESS_TEAM_DOMAIN}`)
  .setAudience(vars.ACCESS_AUD)
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(key);

console.log("Add this line to .dev.vars (public key only):");
console.log(`ACCESS_LOCAL_JWKS=${JSON.stringify({ keys: [jwk] })}`);
console.log("\nCf-Access-Jwt-Assertion value (valid for 2 hours):");
console.log(token);
