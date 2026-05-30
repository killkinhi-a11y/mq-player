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

    const body = await req.json();
    const { subscription } = body;

    if (!subscription) {
      return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
    }

    pushSubscriptions.set(session.userId, subscription);
    console.log(`[push] Subscribed user ${session.userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[push/subscribe] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
