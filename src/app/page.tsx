import { redirect } from "next/navigation";

// Force dynamic rendering - never cache this page
export const dynamic = "force-dynamic";

export default function RootPage() {
  // 302 redirect to /play — browsers never cache redirects
  // Changed from /app to /play to bypass browser disk cache of old broken version
  redirect("/play");
}
