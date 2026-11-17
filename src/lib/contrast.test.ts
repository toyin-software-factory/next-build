import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Pulls `--token: light-dark(#a, #b)` pairs from the stylesheet, the one place token values live. */
function tokens(): Record<string, { light: string; dark: string }> {
  const out: Record<string, { light: string; dark: string }> = {};
  for (const m of css.matchAll(/--([a-z-]+): light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\)/g)) {
    const [, name, light, dark] = m;
    if (name !== undefined && light !== undefined && dark !== undefined)
      out[name] = { light, dark };
  }
  return out;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

// [foreground, background, needed ratio] from spec 0003's contrast table.
const PAIRS: [string, string, number][] = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text-muted", "bg", 4.5],
  ["text-muted", "surface", 4.5],
  ["accent", "surface", 4.5],
  ["accent", "bg", 4.5],
  ["accent-fg", "accent", 4.5],
  ["accent", "accent-soft", 4.5],
  ["text", "accent-soft", 4.5],
  ["danger", "surface", 4.5],
  ["success", "surface", 4.5],
  ["warning", "surface", 4.5],
  ["border-strong", "surface", 3],
  ["border-strong", "bg", 3],
];

describe("design token contrast (WCAG AA)", () => {
  const t = tokens();
  for (const mode of ["light", "dark"] as const) {
    for (const [fg, bg, needed] of PAIRS) {
      it(`${mode}: ${fg} on ${bg} is at least ${String(needed)}:1`, () => {
        const f = t[fg];
        const b = t[bg];
        if (f === undefined || b === undefined) throw new Error(`missing token ${fg} or ${bg}`);
        expect(ratio(f[mode], b[mode])).toBeGreaterThanOrEqual(needed);
      });
    }
  }
});
