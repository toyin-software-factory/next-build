import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The local D1 is shared by every test, so each test posts text no other test uses.
const unique = (label: string) => `${label} ${crypto.randomUUID().slice(0, 8)}`;

test("post an idea with the keyboard and see it on the board", async ({ page }) => {
  const text = unique("Keyboard idea");
  await page.goto("/");
  await page.getByLabel("Your idea").fill(text);
  await page.getByLabel("Your idea").press("Enter");
  await expect(page.getByRole("list").getByText(text)).toBeVisible();
  await expect(page.getByLabel("Your idea")).toHaveValue("");
  await expect(page.locator("#status")).toHaveText("Idea added");
});

test("a posted idea survives a reload and the Add idea button works", async ({ page }) => {
  const text = unique("Button idea");
  await page.goto("/");
  await page.getByLabel("Your idea").fill(text);
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByText(text)).toBeVisible();
  await page.reload();
  await expect(page.getByText(text)).toBeVisible();
});

test("an empty idea is refused with a message and nothing is stored", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your idea").fill("   ");
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByText("Write an idea first.")).toBeVisible();
  await expect(page.getByLabel("Your idea")).toHaveAttribute("aria-invalid", "true");
});

test("an idea over 140 characters is refused, with the text kept and the count shown", async ({
  page,
}) => {
  const text = "x".repeat(145);
  await page.goto("/");
  await page.getByLabel("Your idea").fill(text);
  await expect(page.getByText("5 over the limit")).toBeVisible();
  await page.getByRole("button", { name: "Add idea" }).click();
  await expect(page.getByText(/Ideas can be up to 140 characters/)).toBeVisible();
  await expect(page.getByLabel("Your idea")).toHaveValue(text);
});

test("exactly 140 characters is accepted", async ({ page }) => {
  const text = `${unique("Max")} `.padEnd(140, "m").trimEnd();
  await page.goto("/");
  await page.getByLabel("Your idea").fill(text);
  await page.getByLabel("Your idea").press("Enter");
  await expect(page.getByText(text)).toBeVisible();
});

test("Shift+Enter does not submit", async ({ page }) => {
  await page.goto("/");
  const text = unique("Shift");
  await page.getByLabel("Your idea").fill(text);
  await page.getByLabel("Your idea").press("Shift+Enter");
  await expect(page.getByLabel("Your idea")).toHaveValue(text);
  await expect(page.getByText("Idea added")).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`board has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await page.getByLabel("Your idea").fill(unique(`Axe ${scheme}`));
    await page.getByLabel("Your idea").press("Enter");
    await expect(page.getByRole("list")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test(`form states have no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await page.getByLabel("Your idea").fill("y".repeat(150));
    await page.getByRole("button", { name: "Add idea" }).click();
    await expect(page.getByText(/Ideas can be up to 140/)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
