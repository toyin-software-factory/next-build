// @vitest-environment node
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

// Design tokens only (AGENTS.md): a raw colour in a component or route is a lint error.
// The real project config, with type aware rules switched off: the sample files do not exist on disk,
// so the TypeScript project service could not find them. The colour rule is syntax only.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: "eslint.config.mjs",
  overrideConfig: [tseslint.configs.disableTypeChecked],
});

async function colourErrors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-syntax" && m.message.startsWith("Raw colour"))
    .map((m) => m.message);
}

const COMPONENT = "src/components/Sample.tsx";

describe("design token lint rule", () => {
  it.each([
    ["a hex colour in a class", `export const A = () => <p className="bg-[#ff0000]">x</p>;`],
    ["a short hex colour", `export const a = "#fff";`],
    ["an eight digit hex colour", `export const a = "#11223344";`],
    ["rgb()", `export const a = "rgb(1, 2, 3)";`],
    ["rgba()", `export const a = "rgba(1, 2, 3, 0.5)";`],
    ["hsl()", `export const a = "hsl(10 20% 30%)";`],
    ["oklch()", `export const a = "oklch(0.7 0.1 200)";`],
    ["an arbitrary colour class", `export const a = "text-[color:red]";`],
    ["a template literal", "export const a = (n: string) => `${n} border-[#abc]`;"],
    [
      "hex colours followed by a Tailwind underscore",
      `export const a = "bg-[linear-gradient(90deg,#fff_0%,#000_100%)]";`,
    ],
    ["an inline style value", `export const A = () => <p style={{ color: "#123456" }}>x</p>;`],
  ])("fires on %s in a component", async (_name, code) => {
    expect((await colourErrors(code, COMPONENT)).length).toBeGreaterThan(0);
  });

  it("fires in src/app routes too", async () => {
    expect(await colourErrors(`export const a = "#fff";`, "src/app/sample.ts")).not.toEqual([]);
  });

  it("passes on token classes, variables, selectors and ids", async () => {
    const code = `
      export const A = () => (
        <p className="bg-surface text-muted border-line focus-visible:ring-accent w-[10rem] bg-[var(--surface)]">x</p>
      );
      export const ids = ["#idea-field", "#ideas-heading", "#add-button"];
      export const b = (n: string) => \`\${n} text-fg\`;
    `;
    expect(await colourErrors(code, COMPONENT)).toEqual([]);
  });

  it("passes on a colour type hint that points at a token variable (not a raw colour)", async () => {
    const code = `export const a = "text-[color:var(--surface)] bg-[color:var(--accent)]";`;
    expect(await colourErrors(code, COMPONENT)).toEqual([]);
  });

  it("passes on fragment links and DOM selectors that look like hex colours", async () => {
    const code = `
      export const A = () => <a href="#abc">skip</a>;
      export const B = () => <label htmlFor="#fade" id="#add">x</label>;
      export const el = () => document.querySelector("#abc");
    `;
    expect(await colourErrors(code, COMPONENT)).toEqual([]);
  });

  it("still fires on a colour type hint with a raw value", async () => {
    expect(await colourErrors(`export const a = "text-[color:red]";`, COMPONENT)).not.toEqual([]);
  });

  it("does not apply to globals.css values or to test files", async () => {
    expect(
      await colourErrors(`export const a = "#fff";`, "src/components/Sample.test.tsx"),
    ).toEqual([]);
    expect(await colourErrors(`export const a = "#fff";`, "src/lib/sample.ts")).toEqual([]);
  });

  it("keeps the admin cast rule working in components", async () => {
    const [result] = await eslint.lintText(`const a = {} as Admin; export { a };`, {
      filePath: COMPONENT,
    });
    const ids = (result?.messages ?? []).map((m) => m.message);
    expect(ids.some((m) => m.includes("requireAdmin"))).toBe(true);
  });
});
