import { defineConfig, devices } from "@playwright/test";

import { E2E_ACCESS, e2ePublicKeySet, signE2eToken } from "./tests/e2e/access-keys";

const PORT = 8787;
const baseURL = `http://localhost:${String(PORT)}`;
const isCI = Boolean(process.env.CI);

// The Worker trusts a throwaway key (ACCESS_LOCAL_JWKS works only outside production and with no
// cf-ray header, spec 0006). Base64 because wrangler strips the quotes from plain JSON values.
const accessVars = [
  `ACCESS_TEAM_DOMAIN:${E2E_ACCESS.teamDomain}`,
  `ACCESS_AUD:${E2E_ACCESS.audience}`,
  `ADMIN_EMAIL:${E2E_ACCESS.adminEmail}`,
  `ACCESS_LOCAL_JWKS:${Buffer.from(e2ePublicKeySet()).toString("base64")}`,
]
  .map((pair) => `--var '${pair}'`)
  .join(" ");

const adminToken = await signE2eToken();
const SIGNED_IN = /admin\.signed-in\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    {
      name: "desktop",
      testIgnore: SIGNED_IN,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testIgnore: SIGNED_IN,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    // The admin projects send a locally signed Access token with every request.
    {
      name: "admin-desktop",
      testMatch: SIGNED_IN,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": adminToken },
      },
    },
    {
      name: "admin-mobile",
      testMatch: SIGNED_IN,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": adminToken },
      },
    },
  ],
  // The real Workers runtime (OpenNext build + wrangler) with a local D1, not `next dev`.
  webServer: {
    command: `pnpm preview --port ${String(PORT)} ${accessVars}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 300_000,
    stdout: "pipe",
    env: { APP_ENV: "preview" },
  },
});
