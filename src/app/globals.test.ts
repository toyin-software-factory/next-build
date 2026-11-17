import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

type Tokens = Record<string, string>;

/** Pulls `--name: value;` pairs out of the first block that matches `open`. */
function block(open: RegExp): string {
  const start = css.search(open);
  if (start < 0) throw new Error(`block not found: ${String(open)}`);
  const from = css.indexOf("{", start);
  let depth = 0;
  for (let i = from; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(from + 1, i);
  }
  throw new Error("unbalanced block");
}

function colours(body: string): Tokens {
  const out: Tokens = {};
  for (const m of body.matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
    const [, name, value] = m;
    if (name !== undefined && value !== undefined) out[name] = value.trim();
  }
  return out;
}

const COLOUR_TOKENS = [
  "bg",
  "surface",
  "text",
  "text-muted",
  "border",
  "border-strong",
  "accent",
  "accent-fg",
  "accent-soft",
  "danger",
  "success",
  "warning",
];

describe("colour tokens are written once per mode (spec 0003 AC-1, AC-3)", () => {
  const light = colours(block(/^:root\s*\{/m));
  const dark = colours(block(/@media \(prefers-color-scheme: dark\)/));
  const pairs = colours(block(/@supports \(color: light-dark/));

  it("defines every token in the light, dark and light-dark() blocks", () => {
    for (const name of COLOUR_TOKENS) {
      expect(light[name], `light ${name}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(dark[name], `dark ${name}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(pairs[name], `light-dark ${name}`).toMatch(
        /^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/,
      );
    }
  });

  // contrast.test.ts only reads the light-dark() values, so this keeps the fallback blocks that older
  // browsers use from drifting away from them.
  it("keeps the fallback blocks equal to the light-dark() values", () => {
    for (const name of COLOUR_TOKENS) {
      expect(pairs[name], name).toBe(`light-dark(${light[name] ?? ""}, ${dark[name] ?? ""})`);
    }
  });

  it("follows the device scheme with no manual toggle: color-scheme is light dark", () => {
    expect(block(/^:root\s*\{/m)).toMatch(/color-scheme:\s*light dark;/);
    expect(css).not.toMatch(/\[data-theme|\.dark\s*\{|class="dark"/);
  });
});

describe("focus, motion and size rules", () => {
  it("gives every element a visible :focus-visible ring (AC-8)", () => {
    expect(block(/@layer base/)).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
    );
  });

  it("keeps the ring visible in forced colours (AC-8)", () => {
    expect(block(/@media \(forced-colors: active\)/)).toMatch(/:focus-visible\s*\{[^}]*Highlight/);
  });

  it("turns off control transitions for reduced motion (AC-10)", () => {
    expect(block(/@media \(prefers-reduced-motion: reduce\)/)).toMatch(/transition:\s*none/);
  });

  it("sets a 44 px minimum target on buttons and a 56 px tall vote chip (AC-8)", () => {
    expect(css).toMatch(/min-height:\s*2\.75rem;/);
    expect(css).toMatch(/min-width:\s*2\.75rem;/);
    expect(css).toMatch(/min-height:\s*3\.5rem;/);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

// The tokens only rule (AC-1) until a lint rule for it exists: components name colours through the
// token utilities (bg-surface, text-muted, border-strong ...), never a raw value.
describe("components use tokens only (AC-1)", () => {
  const files = [
    ...sourceFiles(join(root, "src/components")),
    ...sourceFiles(join(root, "src/app")),
  ];

  it("finds the component and route files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [f.slice(root.length + 1), f] as const))(
    "%s has no raw colour value",
    (_name, path) => {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch)\(/);
      expect(source).not.toMatch(/-\[(?:#|rgb|hsl|oklch)/);
      expect(source).not.toMatch(
        /\b(?:bg|text|border|ring|fill|stroke|outline|from|to|via)-(?:red|orange|amber|yellow|green|blue|sky|indigo|violet|purple|pink|slate|gray|zinc|neutral|stone)-\d{2,3}\b/,
      );
    },
  );
});
