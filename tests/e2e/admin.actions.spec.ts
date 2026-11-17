import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { signE2eToken } from "./access-keys";

/** The id of a real server action in this build (setHidden has no caller yet, so it is not bundled). */
function anyActionId(): string {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), ".next", "server", "server-reference-manifest.json"), "utf8"),
  ) as { node: Record<string, unknown> };
  const id = Object.keys(manifest.node)[0];
  if (id === undefined) throw new Error("no server action in the build manifest");
  return id;
}

// AC-11: a server action POST with a foreign Origin is refused by Next.js even with a valid token,
// so the refusal comes from the Origin check and not from authentication.
test("a server action POST to /admin with a foreign Origin is refused, token or not", async ({
  request,
}) => {
  const token = await signE2eToken();
  const response = await request.post("/admin", {
    headers: {
      "Cf-Access-Jwt-Assertion": token,
      Origin: "https://evil.example",
      "Next-Action": anyActionId(),
      "Content-Type": "text/plain;charset=UTF-8",
    },
    data: "[]",
    maxRedirects: 0,
  });
  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(await response.text()).not.toMatch(/"ok"\s*:\s*true/);
});

test("the same POST with a same site Origin is not blocked by the Origin check", async ({
  request,
}) => {
  const token = await signE2eToken();
  const response = await request.post("/admin", {
    headers: {
      "Cf-Access-Jwt-Assertion": token,
      Origin: "http://localhost:8787",
      "Next-Action": anyActionId(),
      "Content-Type": "text/plain;charset=UTF-8",
    },
    data: "[]",
    maxRedirects: 0,
  });
  // Different from the foreign case: the request got past the Origin check (the action id belongs
  // to another route, so Next answers 404 instead of the 500 Origin refusal).
  const foreign = await request.post("/admin", {
    headers: {
      "Cf-Access-Jwt-Assertion": token,
      Origin: "https://evil.example",
      "Next-Action": anyActionId(),
      "Content-Type": "text/plain;charset=UTF-8",
    },
    data: "[]",
    maxRedirects: 0,
  });
  expect([response.status(), (await response.text()).length]).not.toEqual([
    foreign.status(),
    (await foreign.text()).length,
  ]);
});
