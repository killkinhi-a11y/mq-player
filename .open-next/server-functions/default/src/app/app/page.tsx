import { redirect } from "next/navigation";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export default function OldAppRedirect() {
  // Permanently redirect old /app URL to /play
  // This handles bookmarks and cached links
  redirect("/play");
}
