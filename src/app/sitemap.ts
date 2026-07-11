import type { MetadataRoute } from "next";

/**
 * sitemap.ts — rupert-seo-optimizer rule.
 * Next.js App Router generates /sitemap.xml from this file.
 * Lists all public routes for search engine indexing.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mq-player.vercel.app";
  const now = new Date();

  // Static public routes
  const routes = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/play`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
  ];

  return routes;
}
