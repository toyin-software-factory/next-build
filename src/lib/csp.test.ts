import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, generateNonce } from "./csp";

describe("buildContentSecurityPolicy", () => {
  const policy = buildContentSecurityPolicy("abc123", false);

  it("puts the nonce, strict-dynamic and Turnstile in script-src", () => {
    expect(policy).toContain(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' https://challenges.cloudflare.com",
    );
  });

  it("locks down objects, base and frames", () => {
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("frame-src https://challenges.cloudflare.com");
  });

  it("allows unsafe-eval only in development", () => {
    expect(policy).not.toContain("unsafe-eval");
    expect(buildContentSecurityPolicy("abc123", true)).toContain("'unsafe-eval'");
  });
});

describe("generateNonce", () => {
  it("is different every time", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
