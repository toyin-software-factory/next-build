// Redraws src/app/opengraph-image.png (1200 by 630) from scripts/share-card.html. Run: node scripts/share-card.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = new URL("../", import.meta.url);
const fontFile = fileURLToPath(
  new URL("node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", root),
);
const font = `data:font/woff2;base64,${readFileSync(fontFile).toString("base64")}`;
const html = readFileSync(new URL("scripts/share-card.html", root), "utf8").replace(
  "INTER_URL",
  font,
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: fileURLToPath(new URL("src/app/opengraph-image.png", root)) });
await browser.close();
