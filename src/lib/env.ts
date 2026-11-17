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

const secretSchema = z.string().min(16).max(256);

/**
 * The salt for the address hash (spec 0007). A Worker secret in previews and production, set from
 * .dev.vars locally. Null when missing or too short: the caller then skips the address limits and
 * never falls back to a shared key. Never logged.
 */
export async function getAbuseSalt(): Promise<string | null> {
  try {
    // Loaded on use so next.config.ts, which imports this file, never pulls in the Workers adapter.
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const parsed = secretSchema.safeParse(
      (getCloudflareContext().env as { ABUSE_SALT?: unknown }).ABUSE_SALT,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Turnstile secret: the Worker secret in production (null when missing), the test secret elsewhere. */
export async function getTurnstileSecret(): Promise<string | null> {
  if (getAppEnv() !== "production") return TURNSTILE_TEST_SECRET_KEY;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const parsed = z
      .string()
      .min(1)
      .safeParse(
        (getCloudflareContext().env as { TURNSTILE_SECRET_KEY?: unknown }).TURNSTILE_SECRET_KEY,
      );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Turnstile site key, inlined at build time: the real key in production (null when missing), the test key elsewhere. */
export function getTurnstileSiteKey(): string | null {
  if (getAppEnv() !== "production") return TURNSTILE_TEST_SITE_KEY;
  const parsed = z.string().min(1).safeParse(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  return parsed.success ? parsed.data : null;
}

/** True when NEXT_PUBLIC_SITE_URL is a real URL (getSiteUrl quietly falls back to localhost). */
export function isSiteUrlConfigured(): boolean {
  return z.url().safeParse(process.env.NEXT_PUBLIC_SITE_URL).success;
}
