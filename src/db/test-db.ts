import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/sqlite-proxy";

import * as schema from "./schema";
import type { Db } from "./queries";

/** Test only: a fresh in memory SQLite with the real migrations applied, behind the same Drizzle API as D1. */
export function createTestDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("pragma foreign_keys = on");
  const dir = join(process.cwd(), "drizzle");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(join(dir, file), "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return drizzle(
    (query, params, method) => {
      const stmt = sqlite.prepare(query);
      const args = params as never[];
      if (method === "run") {
        stmt.run(...args);
        return Promise.resolve({ rows: [] });
      }
      stmt.setReturnArrays(true);
      const rows = stmt.all(...args) as unknown as unknown[][];
      return Promise.resolve({ rows: method === "get" ? (rows[0] ?? []) : rows });
    },
    { schema },
  );
}
