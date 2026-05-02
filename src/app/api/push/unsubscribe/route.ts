import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";

// In-memory store for push subscriptions (replace with DB when ready)
const pushSubscriptions = new Map<string, unknown>();

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    pushSubscriptions.delete(session.userId);
    console.log(`[push] Unsubscribed user ${session.userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[push/unsubscribe] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
