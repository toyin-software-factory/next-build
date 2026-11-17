import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into drizzle/ from src/db/schema.ts. Wrangler applies them
// (`pnpm db:migrate:local|remote|preview`); drizzle-kit never connects to a database.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
