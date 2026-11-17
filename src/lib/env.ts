import { z } from "zod";

/** Production or preview. Fixed per build in next.config.ts; "preview" covers local, CI and previews. */
export type AppEnv = "production" | "preview";

const appEnvSchema = z.enum(["production", "preview"]);

/**
 * Resolves APP_ENV at build time (spec 0001): an explicit APP_ENV wins, else
 * production when Workers Builds builds `main`, else preview.
 */
export function resolveAppEnv(env: Record<string, string | undefined>): AppEnv {
  const explicit = env.APP_ENV;
  if (explicit !== undefined && explicit !== "") return appEnvSchema.parse(explicit);
  return env.WORKERS_CI_BRANCH === "main" ? "production" : "preview";
}

/** The only way code reads the environment: inlined by next.config.ts. Anything unknown is "preview". */
export function getAppEnv(): AppEnv {
  const parsed = appEnvSchema.safeParse(process.env.APP_ENV);
  return parsed.success ? parsed.data : "preview";
}

/** Cloudflare's published Turnstile test keys. Public, so they live in code. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const DEFAULT_SITE_URL = "http://localhost:3000";

/** Canonical site URL for SEO. Falls back to localhost so first deploys and local runs build. */
export function getSiteUrl(): string {
  const parsed = z.url().safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  return (parsed.success ? parsed.data : DEFAULT_SITE_URL).replace(/\/$/, "");
}
