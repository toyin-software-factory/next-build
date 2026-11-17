// Resets the SHARED preview database (`next-build-preview`) and re-applies every migration.
//
// WHO RUNS THIS: only the owner of the currently open schema PR (spec 0001: one open PR at a
// time may add a migration). Before running it, check that your branch contains EVERY
// migration the active previews use. Otherwise a preview built from another branch will
// point at tables it does not know and break. Run it only when the shared database has
// drifted. It holds test data only; production is never touched (it uses
// wrangler.preview-migrations.jsonc, which binds only the preview database).
//
// It drops only the app's tables and the d1_migrations history, never sqlite_* or _cf_*
// system tables, then runs `pnpm db:migrate:preview`.
import { execFileSync } from "node:child_process";

const CONFIG = "wrangler.preview-migrations.jsonc";

function wrangler(args) {
  return execFileSync("pnpm", ["exec", "wrangler", ...args], { encoding: "utf8" });
}

function query(sql) {
  const out = wrangler([
    "d1",
    "execute",
    "DB",
    "--remote",
    "--config",
    CONFIG,
    "--json",
    "--command",
    sql,
  ]);
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}

const tables = query(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
).map((row) => row.name);

for (const name of tables) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Refusing to drop odd table name: ${name}`);
}

if (tables.length > 0) {
  const drops = tables.map((name) => `DROP TABLE IF EXISTS "${name}";`).join(" ");
  query(`PRAGMA defer_foreign_keys = on; ${drops}`);
}
console.log(`Dropped ${String(tables.length)} table(s) from next-build-preview.`);

execFileSync("pnpm", ["db:migrate:preview"], { stdio: "inherit" });
