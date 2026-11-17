import { expect, test } from "@playwright/test";

// Spec 0008: head tags, share image, robots and sitemap.
test.describe("SEO and share card", () => {
  test("the board has a title, description, canonical and share tags (AC-1, AC-2)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Next Build/);
    const meta = (selector: string) => page.locator(selector).getAttribute("content");
    const description = (await meta('meta[name="description"]')) ?? "";
    expect(description.length).toBeGreaterThanOrEqual(50);
    expect(description.length).toBeLessThanOrEqual(160);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /^https?:\/\/[^/]+\/?$/,
    );
    for (const property of ["title", "description", "type", "url", "site_name"]) {
      expect(await meta(`meta[property="og:${property}"]`)).toBeTruthy();
    }
    expect(await meta('meta[property="og:image"]')).toMatch(/^https?:\/\/.+opengraph-image/);
    expect(await meta('meta[property="og:image:width"]')).toBe("1200");
    expect(await meta('meta[property="og:image:height"]')).toBe("630");
    expect(await meta('meta[property="og:image:alt"]')).toBeTruthy();
    expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(await meta('meta[name="twitter:image"]')).toMatch(/opengraph-image/);
  });

  test("canonical, og:url and the images share one origin, and twitter uses the same image (AC-2)", async ({
    page,
  }) => {
    await page.goto("/");
    const meta = (selector: string) => page.locator(selector).getAttribute("content");
    const canonical = new URL(
      (await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "",
    );
    const ogUrl = new URL((await meta('meta[property="og:url"]')) ?? "");
    const ogImage = new URL((await meta('meta[property="og:image"]')) ?? "");
    expect(ogUrl.origin).toBe(canonical.origin);
    expect(ogImage.origin).toBe(canonical.origin);
    expect(await meta('meta[name="twitter:image"]')).toBe(ogImage.href);
    expect(await meta('meta[name="twitter:image:alt"]')).toBeTruthy();
  });

  test("the share image is a 1200 by 630 PNG (AC-3)", async ({ page, request }) => {
    await page.goto("/");
    const url = new URL(
      (await page.locator('meta[property="og:image"]').getAttribute("content")) ?? "",
    );
    const response = await request.get(url.pathname + url.search);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(response.headers()["cache-control"]).toBeTruthy();
    const body = await response.body();
    expect(body.subarray(1, 4).toString()).toBe("PNG");
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);
  });

  test("robots and sitemap (AC-4)", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Allow: \//);
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/);
  });

  test("the board has one h1 (AC-6)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
  });
});
