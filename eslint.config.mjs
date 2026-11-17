import nextVitals from "eslint-config-next/core-web-vitals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const ADMIN_CAST_SELECTORS = [
  {
    selector: "TSAsExpression[typeAnnotation.typeName.name='Admin']",
    message: "Only requireAdmin() in src/lib/access.ts may create an Admin (spec 0006).",
  },
  {
    selector: "TSTypeAssertion[typeAnnotation.typeName.name='Admin']",
    message: "Only requireAdmin() in src/lib/access.ts may create an Admin (spec 0006).",
  },
];

// Design tokens only (AGENTS.md, docs/design/design.md): a raw hex, rgb(), hsl() or oklch() colour, or a
// Tailwind arbitrary colour class such as bg-[#fff], never belongs in a component or route. Token values
// live in src/app/globals.css. The pattern is written once and used for strings and template text.
const RAW_COLOUR =
  "(#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![a-zA-Z0-9-])|\\b(rgba?|hsla?|oklch|oklab)\\(|\\b[a-z]+-\\[color:(?!var\\())";
const RAW_COLOUR_MESSAGE =
  "Raw colour. Use a design token class (for example bg-surface or text-muted) from src/app/globals.css instead (docs/design/design.md).";
// A string that is a link target or a DOM selector is not a colour: "#abc" can be a fragment or an id.
const REFERENCE_CONTEXT =
  ":not(JSXAttribute[name.name=/^(href|id|htmlFor|aria-.+)$/] > Literal):not(CallExpression[callee.property.name=/^(querySelector|querySelectorAll|getElementById|closest|matches)$/] > Literal)";
export const RAW_COLOUR_SELECTORS = [
  { selector: `Literal[value=/${RAW_COLOUR}/]${REFERENCE_CONTEXT}`, message: RAW_COLOUR_MESSAGE },
  { selector: `TemplateElement[value.raw=/${RAW_COLOUR}/]`, message: RAW_COLOUR_MESSAGE },
];

export default defineConfig([
  ...nextVitals,
  // eslint-config-next already registers the jsx-a11y plugin; turn on its full recommended rule set.
  { files: ["**/*.{jsx,tsx}"], rules: jsxA11y.flatConfigs.recommended.rules },
  // typescript-eslint strict, type aware, for TypeScript sources. This replaces
  // eslint-config-next/typescript (only typescript-eslint recommended), whose bundled
  // copy of the plugin would clash with this one.
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  // Admin proof (spec 0006): only the admin route and the access module may import the admin
  // queries, and only src/lib/access.ts may build an Admin with a cast.
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["src/app/admin/**", "src/lib/access.ts", "src/db/admin-queries.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/admin-queries", "**/admin-queries.ts"],
              message:
                "Admin queries are only for src/app/admin and src/lib/access.ts (spec 0006). Call them from an admin server action.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["src/lib/access.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...ADMIN_CAST_SELECTORS],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      // A later block replaces the rule, so the admin cast selectors are repeated here.
      "no-restricted-syntax": ["error", ...ADMIN_CAST_SELECTORS, ...RAW_COLOUR_SELECTORS],
    },
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    "dist-check/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "cloudflare-env.d.ts",
    // Agent tooling and scripts owned by other skills.
    ".claude/**",
    "tools/**",
  ]),
]);
