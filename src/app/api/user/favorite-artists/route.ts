import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { database } from "@/lib/database";

/**
 * GET /api/user/favorite-artists — load user's favorite artists
 * POST /api/user/favorite-artists — save user's favorite artists
 * POST /api/user/onboarding-complete — mark onboarding as done
 */

async function handler(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.userId;

  if (request.method === "GET") {
    try {
      const user = await database.findUserById(userId);
      const artists = user?.favoriteArtists ? JSON.parse(user.favoriteArtists) : [];
      return NextResponse.json({
        artists,
        onboardingComplete: user?.onboardingComplete ?? false,
      });
    } catch {
      return NextResponse.json({ artists: [], onboardingComplete: false });
    }
  }

  if (request.method === "POST") {
    try {
      const body = await request.json();
      const { artists, completeOnboarding } = body;

      const updateData: Record<string, unknown> = {};
      if (Array.isArray(artists)) {
        updateData.favoriteArtists = JSON.stringify(artists);
      }
      if (completeOnboarding === true) {
        updateData.onboardingComplete = true;
      }

      await database.updateUser(userId, updateData);

      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export const GET = handler;
export const POST = handler;
