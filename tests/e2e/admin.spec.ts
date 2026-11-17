import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { E2E_ACCESS, otherPrivatePem, signE2eToken } from "./access-keys";

const REFUSAL = "This page is only for the site admin.";

test.describe("/admin with no valid sign in", () => {
  test("answers 403 with the plain page and the safety headers", async ({ request }) => {
    const response = await request.get("/admin", { maxRedirects: 3 });
    expect(response.status()).toBe(403);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-robots-tag"]).toBe("noindex");
    expect(response.headers()["content-security-policy"]).toMatch(/nonce-/);
    expect(response.headers().location).toBeUndefined();
    expect(await response.text()).toContain(REFUSAL);
  });

  test("gives the same 403 for the four tricky URLs and shows no idea", async ({ request }) => {
    for (const [path, headers] of [
      ["/admin/", {}],
      ["/%61dmin", {}],
      ["/admin?_rsc=x", {}],
      ["/admin", { RSC: "1" }],
    ] as const) {
      const response = await request.get(path, { headers, maxRedirects: 3 });
      expect({ path, status: response.status() }).toEqual({ path, status: 403 });
      expect(await response.text()).not.toMatch(/votes?\b.*\bhidden/i);
    }
  });

  test("refuses a token signed by another key, another audience or another email", async ({
    request,
  }) => {
    const tokens = [
      await signE2eToken({ privatePem: otherPrivatePem() }),
      await signE2eToken({ audience: "someone-else" }),
      await signE2eToken({ email: "intruder@example.test" }),
    ];
    for (const token of tokens) {
      const response = await request.get("/admin", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      });
      expect(response.status()).toBe(403);
    }
  });

  test("ignores the Access cookie (only the header counts)", async ({ request }) => {
    const token = await signE2eToken();
    const response = await request.get("/admin", {
      headers: { Cookie: `CF_Authorization=${token}` },
    });
    expect(response.status()).toBe(403);
  });

  test("a deployed host cannot turn on the local key (cf-ray)", async ({ request }) => {
    const token = await signE2eToken();
    const response = await request.get("/admin", {
      headers: { "Cf-Access-Jwt-Assertion": token, "cf-ray": "abc123-LHR" },
    });
    expect(response.status()).toBe(403);
  });

  test("the 403 page has no accessibility violations", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: REFUSAL })).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    }
  });

  test("the public board stays open without a login", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
  });
});

test("test identity matches what the Worker was started with", () => {
  expect(E2E_ACCESS.teamDomain).toMatch(/\.cloudflareaccess\.com$/);
});
