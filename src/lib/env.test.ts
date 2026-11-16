import { describe, expect, it, vi } from "vitest";

import { getAppEnv, getSiteUrl, resolveAppEnv } from "./env";

describe("resolveAppEnv", () => {
  it("uses an explicit APP_ENV first", () => {
    expect(resolveAppEnv({ APP_ENV: "production", WORKERS_CI_BRANCH: "feature" })).toBe(
      "production",
    );
    expect(resolveAppEnv({ APP_ENV: "preview", WORKERS_CI_BRANCH: "main" })).toBe("preview");
  });

  it("is production only when Workers Builds builds main", () => {
    expect(resolveAppEnv({ WORKERS_CI_BRANCH: "main" })).toBe("production");
    expect(resolveAppEnv({ WORKERS_CI_BRANCH: "fsd-t01" })).toBe("preview");
    expect(resolveAppEnv({})).toBe("preview");
  });

  it("rejects an unknown APP_ENV", () => {
    expect(() => resolveAppEnv({ APP_ENV: "staging" })).toThrow();
  });
});

describe("getAppEnv", () => {
  it("falls back to preview", () => {
    vi.stubEnv("APP_ENV", "");
    expect(getAppEnv()).toBe("preview");
    vi.stubEnv("APP_ENV", "production");
    expect(getAppEnv()).toBe("production");
    vi.unstubAllEnvs();
  });
});

describe("getSiteUrl", () => {
  it("defaults to localhost and trims a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(getSiteUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://next-build.example.workers.dev/");
    expect(getSiteUrl()).toBe("https://next-build.example.workers.dev");
    vi.unstubAllEnvs();
  });
});
