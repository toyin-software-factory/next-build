import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a signed in admin sees the admin page", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toBe("no-store");
  await expect(page.getByRole("heading", { level: 2, name: "Admin" })).toBeVisible();
  await expect(page.getByText(/\d+ ideas?, \d+ hidden\./)).toBeVisible();
});

test("the admin page has no accessibility violations in light and dark", async ({ page }) => {
  await page.goto("/admin");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  }
});
