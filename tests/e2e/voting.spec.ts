import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const unique = (label: string) => `${label} ${crypto.randomUUID().slice(0, 8)}`;

async function post(page: Page, text: string) {
  await page.goto("/");
  await page.getByLabel("Your idea").fill(text);
  await page.getByLabel("Your idea").press("Enter");
  await expect(page.getByRole("list").getByText(text)).toBeVisible();
}
const row = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });
const vote = (page: Page, text: string) =>
  row(page, text).getByRole("button", { name: /Upvote idea/ });

test("vote, reload and still voted, then take the vote back", async ({ page }) => {
  const text = unique("Vote me");
  await post(page, text);
  await expect(vote(page, text)).toHaveAccessibleName("Upvote idea, 0 votes");
  await vote(page, text).click();
  await expect(vote(page, text)).toHaveAccessibleName("Upvote idea, 1 vote");
  await expect(vote(page, text)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#status")).toHaveText("Voted. Now 1 vote.");
  await page.reload();
  await expect(vote(page, text)).toHaveAttribute("aria-pressed", "true");
  await vote(page, text).click();
  await expect(vote(page, text)).toHaveAccessibleName("Upvote idea, 0 votes");
  await expect(vote(page, text)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#status")).toHaveText("Not voted. Now 0 votes.");
});

test("another browser sees the count but not the voted state, and adds its own vote", async ({
  page,
  browser,
}) => {
  const text = unique("Two browsers");
  await post(page, text);
  await vote(page, text).click();
  await expect(vote(page, text)).toHaveAccessibleName("Upvote idea, 1 vote");
  // The success announcement comes only after the server stored the vote.
  await expect(page.locator("#status")).toHaveText("Voted. Now 1 vote.");

  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto("/");
  await expect(vote(second, text)).toHaveAccessibleName("Upvote idea, 1 vote");
  await expect(vote(second, text)).toHaveAttribute("aria-pressed", "false");
  await vote(second, text).click();
  await expect(vote(second, text)).toHaveAccessibleName("Upvote idea, 2 votes");
  await other.close();
});

test("Enter and Space both vote", async ({ page }) => {
  const text = unique("Keys");
  await post(page, text);
  await vote(page, text).focus();
  await page.keyboard.press("Enter");
  await expect(vote(page, text)).toHaveAttribute("aria-pressed", "true");
  await expect(vote(page, text)).not.toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Space");
  await expect(vote(page, text)).toHaveAttribute("aria-pressed", "false");
});

test("a voted row moves up the board and keeps keyboard focus", async ({ page }) => {
  const older = unique("Older");
  const newer = unique("Newer");
  await post(page, older);
  await post(page, newer);
  const order = async () =>
    (await page.getByRole("listitem").allInnerTexts()).findIndex((t) => t.includes(older)) -
    (await page.getByRole("listitem").allInnerTexts()).findIndex((t) => t.includes(newer));
  // Same votes: the newer idea is listed first.
  expect(await order()).toBeGreaterThan(0);
  await vote(page, older).focus();
  await page.keyboard.press("Enter");
  await expect(vote(page, older)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(order).toBeLessThan(0);
  await expect(vote(page, older)).toBeFocused();
});

test("the vote button is at least 44 by 56 pixels", async ({ page }) => {
  const text = unique("Target size");
  await post(page, text);
  const box = await vote(page, text).boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
});

for (const scheme of ["light", "dark"] as const) {
  test(`voted and not voted rows have no axe violations in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const voted = unique("Axe voted");
    await post(page, voted);
    await post(page, unique("Axe plain"));
    await vote(page, voted).click();
    await expect(vote(page, voted)).toHaveAttribute("aria-pressed", "true");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("a failed vote shows the row error with Try again, and axe stays clean", async ({ page }) => {
  const text = unique("Failing");
  await post(page, text);
  await page.route("**/", async (route) => {
    if (route.request().method() === "POST") await route.abort();
    else await route.continue();
  });
  await vote(page, text).click();
  await expect(row(page, text).getByRole("alert")).toContainText("Couldn't save your vote.");
  await expect(page.locator("#status")).not.toContainText("Voted");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.unroute("**/");
  await row(page, text).getByRole("button", { name: "Try again" }).click();
  await expect(vote(page, text)).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, text).getByRole("alert")).toHaveCount(0);
  await expect(vote(page, text)).toBeFocused();
});
