import type { MetadataRoute } from "next";

/**
 * robots.ts — rupert-seo-optimizer rule.
 * Next.js App Router generates /robots.txt from this file.
 * Allows all crawlers to index all routes, points to sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mq-player.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/"],
      },
      // Allow social media crawlers explicitly (for OG previews)
      {
        userAgent: ["Googlebot", "Bingbot", "Twitterbot", "facebookexternalhit", "LinkedInBot"],
        allow: "/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
