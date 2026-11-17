import nextVitals from "eslint-config-next/core-web-vitals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

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
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression[typeAnnotation.typeName.name='Admin']",
          message: "Only requireAdmin() in src/lib/access.ts may create an Admin (spec 0006).",
        },
        {
          selector: "TSTypeAssertion[typeAnnotation.typeName.name='Admin']",
          message: "Only requireAdmin() in src/lib/access.ts may create an Admin (spec 0006).",
        },
      ],
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
