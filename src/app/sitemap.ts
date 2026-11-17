import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${getSiteUrl()}/`, changeFrequency: "daily", priority: 1 }];
}
