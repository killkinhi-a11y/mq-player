import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import { getSessionFromRequest } from "@/lib/auth";

/**
 * GET /api/auth/link/providers — W13 account linking status.
 *
 * Lists the external identities attached to the CURRENT session user
 * (requires auth; 401 otherwise). Response shape:
 *
 * {
 *   google:   { linked: boolean, email: string | null },
 *   telegram: { linked: boolean, username: string | null }
 * }
 *
 * No secrets, no provider user ids, no emails of OTHER users — only the
 * session user's own linkage state.
 */
async function handler(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [identities, me] = await Promise.all([
      database.findAuthIdentitiesByUserId(session.userId),
      database.findUserById(session.userId),
    ]);

    const google = identities.find((i) => i.provider === "google") ?? null;
    // Telegram can be linked via AuthIdentity OR the legacy User.telegramChatId
    const telegramIdentity = identities.find((i) => i.provider === "telegram") ?? null;

    return NextResponse.json({
      google: {
        linked: !!google,
        email: google?.providerEmail ?? null,
      },
      telegram: {
        linked: !!(telegramIdentity || me?.telegramChatId),
        username:
          telegramIdentity?.providerUsername ?? me?.telegramUsername ?? null,
      },
    });
  } catch (error) {
    console.error("link/providers error:", error);
    return NextResponse.json({ error: "Failed to load providers" }, { status: 500 });
  }
}

export { handler as GET, handler as POST };
