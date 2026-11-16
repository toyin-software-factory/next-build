import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Default (static assets) incremental cache. No R2, no KV (spec 0001).
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
