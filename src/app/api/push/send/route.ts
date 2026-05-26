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
    const { userId, title, body: notifBody, data } = body;

    if (!userId || !title) {
      return NextResponse.json({ error: "Missing userId or title" }, { status: 400 });
    }

    const subscription = pushSubscriptions.get(userId as string);
    if (!subscription) {
      return NextResponse.json({ error: "No subscription found for user" }, { status: 404 });
    }

    // Placeholder: actual web-push send requires VAPID keys configured.
    // Replace with: webpush.sendNotification(subscription, JSON.stringify({ title, body: notifBody, data }))
    console.log(`[push/send] Would send to user ${userId}: "${title}" — "${notifBody || ""}"`);

    return NextResponse.json({ success: true, message: "Notification logged (VAPID keys not configured)" });
  } catch (error) {
    console.error("[push/send] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
