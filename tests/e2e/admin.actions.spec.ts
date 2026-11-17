import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";

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

/** The id of the real setHidden action (it is bundled now that the admin page calls it). */
function setHiddenActionId(): string {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), ".next", "server", "server-reference-manifest.json"), "utf8"),
  ) as { node: Record<string, { exportedName?: string }> };
  const entry = Object.entries(manifest.node).find(([, v]) => v.exportedName === "setHidden");
  if (entry === undefined) throw new Error("setHidden is not in the build manifest");
  return entry[0];
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
  // Next answers a refused Origin with 500, never 200 and never a result.
  expect(response.status()).toBe(500);
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
  // The same call with a same site Origin gets past the Origin check and is served (200); the
  // foreign Origin test above gets the 500 refusal.
  expect(response.status()).toBe(200);
});

// AC-5: the real setHidden action id posted to the public page with no token does nothing, and the
// idea stays on the board (a read before and after).
test("setHidden posted to / with no token does nothing and writes nothing", async ({
  page,
  request,
}) => {
  const text = `Keep me ${crypto.randomUUID().slice(0, 8)}`;
  await page.goto("/");
  await page.getByLabel("Your idea").fill(text);
  await page.getByLabel("Your idea").press("Enter");
  await expect(page.getByRole("list").getByText(text)).toBeVisible();

  // The seeded idea's real id, read from the board row (`idea-<id>-text`).
  const rowId = await page.getByText(text).first().getAttribute("id");
  const ideaId = rowId?.match(/^idea-(.+)-text$/)?.[1];
  expect(ideaId).toBeDefined();
  const response = await request.post("/", {
    headers: {
      Origin: "http://localhost:8787",
      "Next-Action": setHiddenActionId(),
      "Content-Type": "text/plain;charset=UTF-8",
    },
    data: JSON.stringify([{ ideaId, hidden: true }]),
    maxRedirects: 0,
  });
  // Next does not run an action from another route's bundle (it answers `{}`); if a future version
  // did, the guard answers forbidden. Either way there is no success and nothing is written.
  const body = await response.text();
  expect(body === "{}" || body.includes('"code":"forbidden"')).toBe(true);
  expect(body).not.toMatch(/"ok"\s*:\s*true/);

  await page.reload();
  await expect(page.getByRole("list").getByText(text)).toBeVisible();
});
