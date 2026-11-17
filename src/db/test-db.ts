import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";

import * as schema from "./schema";
import type { Db } from "./queries";

type Proxy = Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let proxy: Proxy | null = null;

/**
 * Test only: the real local D1 (workerd through wrangler's local runtime) with the real migrations
 * applied once per test file. Each call empties the tables, so every test starts clean.
 * Test files using this need `// @vitest-environment node`.
 */
export async function createTestDb(): Promise<Db> {
  if (proxy === null) {
    const created = await getPlatformProxy<{ DB: D1Database }>({
      persist: { path: mkdtempSync(join(tmpdir(), "nb-d1-")) },
    });
    proxy = created;
    const dir = join(process.cwd(), "drizzle");
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const statements = readFileSync(join(dir, file), "utf8")
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      await created.env.DB.batch(statements.map((s) => created.env.DB.prepare(s)));
    }
  }
  await proxy.env.DB.batch([
    proxy.env.DB.prepare("delete from votes"),
    proxy.env.DB.prepare("delete from ideas"),
  ]);
  return drizzle(proxy.env.DB, { schema });
}

/** Call from afterAll so the local runtime shuts down. */
export async function disposeTestDb(): Promise<void> {
  await proxy?.dispose();
  proxy = null;
}
