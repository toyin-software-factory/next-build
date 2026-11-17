import { execFileSync } from "node:child_process";

/** Empties the abuse counters in the local D1 so a run never starts near a limit (spec 0007). */
export default function globalSetup(): void {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", "--local", "--command", "delete from rate_events"],
    { stdio: "ignore" },
  );
}
