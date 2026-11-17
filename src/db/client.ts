import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

/** The only way to reach the database (spec 0001). Server only: client components never import src/db. */
export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}
