import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

import { resolveAppEnv } from "./src/lib/env";

// Production or preview, fixed per build (spec 0001): APP_ENV if set, else
// production when Workers Builds builds main, else preview. Code reads it with getAppEnv().
const appEnv = resolveAppEnv(process.env);

// The Content-Security-Policy is per request (nonce), so it is set in middleware.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  env: { APP_ENV: appEnv },
  // OpenNext on Workers has no built in image optimizer; images are pre sized.
  images: { unoptimized: true },
  poweredByHeader: false,
  // Stop `next dev` writing its own AGENTS.md. Root AGENTS.md is owned by /audit.
  agentRules: false,
  headers() {
    return Promise.resolve([
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ]);
  },
};

export default nextConfig;

// Makes Cloudflare bindings (including a local D1) available through getCloudflareContext() in `next dev`.
void initOpenNextCloudflareForDev();
