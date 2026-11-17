import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

async function postIdea(page: Page, text: string) {
  await page.goto("/");
  await page.getByLabel("Your idea").fill(text);
  await page.getByLabel("Your idea").press("Enter");
  await expect(page.getByRole("list").getByText(text)).toBeVisible();
}

const unique = (label: string) => `${label} ${crypto.randomUUID().slice(0, 8)}`;

test("a signed in admin sees the admin page", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toBe("no-store");
  await expect(page.getByRole("heading", { level: 2, name: "Admin" })).toBeVisible();
  await expect(page.getByText(/\d+ ideas?, \d+ hidden\./)).toBeVisible();
});

test("the admin page has no accessibility violations in light and dark", async ({ page }) => {
  await postIdea(page, unique("Axe row"));
  await page.goto("/admin");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  }
});

// Only one of the table and the labelled list is in the accessibility tree at a time, so the
// button role query finds exactly the visible one.
test("hide removes an idea from the public board and unhide brings it back", async ({ page }) => {
  const text = unique("Spam idea");
  await postIdea(page, text);

  await page.goto("/admin");
  const row = page.getByRole("row").filter({ hasText: text });
  const item = page.getByRole("listitem").filter({ hasText: text });
  const rowOrItem = (await row.count()) > 0 ? row : item;
  await rowOrItem.getByRole("button", { name: "Hide idea" }).click();
  await expect(rowOrItem.getByRole("button", { name: "Unhide idea" })).toBeVisible();
  await expect(rowOrItem.getByText("Hidden", { exact: true })).toBeVisible();
  await expect(page.locator("#status")).toHaveText("Idea hidden");
  await expect(rowOrItem.getByRole("button", { name: "Unhide idea" })).toBeFocused();

  await page.goto("/");
  await expect(page.getByText(text)).toHaveCount(0);

  await page.goto("/admin");
  await expect(rowOrItem.getByText("Hidden", { exact: true })).toBeVisible();
  await rowOrItem.getByRole("button", { name: "Unhide idea" }).click();
  await expect(rowOrItem.getByRole("button", { name: "Hide idea" })).toBeVisible();
  await expect(page.locator("#status")).toHaveText("Idea shown again");

  await page.goto("/");
  await expect(page.getByRole("list").getByText(text)).toBeVisible();
});
