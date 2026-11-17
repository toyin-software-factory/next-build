import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { TURNSTILE_SCRIPT, expect, test } from "./fixtures";

const unique = (label: string) => `${label} ${crypto.randomUUID().slice(0, 8)}`;

async function submit(page: Page, text: string) {
  await page.getByLabel("Your idea").fill(text);
  await page.getByLabel("Your idea").press("Enter");
}

test.describe("with the stubbed widget", () => {
  test("a fourth quick post is refused with the friendly message, the earlier ones stay (AC-1, AC-12)", async ({
    page,
  }) => {
    await page.goto("/");
    const texts = [unique("Burst a"), unique("Burst b"), unique("Burst c")];
    for (const text of texts) {
      await submit(page, text);
      await expect(page.getByRole("list").getByText(text)).toBeVisible();
    }
    const fourth = unique("Burst d");
    await submit(page, fourth);
    await expect(page.getByRole("alert").filter({ hasText: "posting limit" })).toHaveText(
      /You've reached the posting limit for now\. Please try again in a little while\./,
    );
    await expect(page.getByLabel("Your idea")).toHaveValue(fourth);
    await expect(page.getByRole("list").getByText(fourth)).toHaveCount(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("quick voting is refused after a burst with the friendly message in the row (AC-3)", async ({
    page,
  }) => {
    const text = unique("Vote burst");
    await page.goto("/");
    await submit(page, text);
    await expect(page.getByRole("list").getByText(text)).toBeVisible();
    const button = page
      .getByRole("listitem")
      .filter({ hasText: text })
      .getByRole("button", { name: /Upvote idea/ });
    const message = page.getByText(
      "You've reached the voting limit for now. Please try again in a little while.",
    );
    let attempts = 0;
    while (attempts < 70 && (await message.count()) === 0) {
      attempts += 1;
      await button.click();
      await expect(button).not.toHaveAttribute("aria-disabled", "true");
    }
    await expect(message).toBeVisible();
    // The burst limit (30 per 10 seconds) trips well before the hourly browser cap of 60 would.
    expect(attempts).toBeLessThan(60);
  });

  test("the status message for a shown check is announced and the page stays accessible (AC-12)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => "__turnstile" in window);
    await page.evaluate(() => {
      (window as unknown as { __turnstile: Record<string, () => void> }).__turnstile[
        "before-interactive-callback"
      ]?.();
    });
    await expect(page.locator("#status")).toHaveText("One more step: complete the check below.");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("script blocked", () => {
  test.use({ stubTurnstile: false });

  test("Add idea shows the challenge message and stores nothing (AC-13)", async ({ page }) => {
    await page.route(TURNSTILE_SCRIPT, (route) => route.abort());
    const text = unique("Blocked script");
    await page.goto("/");
    await submit(page, text);
    await expect(page.getByRole("alert").filter({ hasText: "not a robot" })).toContainText(
      /couldn't confirm you're not a robot/i,
      { timeout: 20_000 },
    );
    await page.reload();
    await expect(page.getByText(text)).toHaveCount(0);
  });
});

test.describe("real test key widget", () => {
  test.use({ stubTurnstile: false });

  test("loads under the page's CSP with no violations and yields a token (AC-12)", async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/content security policy|refused to/i.test(message.text()))
        violations.push(message.text());
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`Refused to load: ${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    await page.goto("/");
    await expect
      .poll(() => page.evaluate(() => typeof (window as { turnstile?: unknown }).turnstile), {
        timeout: 20_000,
      })
      .toBe("object");
    await expect(page.locator("input[name='cf-turnstile-response']")).toHaveValue(/.+/, {
      timeout: 20_000,
    });
    // Cloudflare's script probes for eval inside a try block and carries on without it, and the token
    // above proves the check works. Anything else (a blocked script, frame or connection) fails here.
    expect(violations.filter((line) => !/script-src eval/.test(line))).toEqual([]);
  });
});
