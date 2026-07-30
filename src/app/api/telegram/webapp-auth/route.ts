import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { database } from "@/lib/database";
import { signToken, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/telegram/webapp-auth
 *
 * Validates Telegram Mini App initData and creates/links a user session.
 *
 * Body: { initData: string }
 *
 * initData is the query string Telegram passes to the Mini App iframe,
 * e.g. "query_id=...&user=%7B...%7D&auth_date=...&hash=..."
 *
 * Validation (per Telegram docs):
 * 1. Extract `hash` from the data
 * 2. Build a `data_check_string` from the remaining params (sorted, newline-joined `k=v`)
 * 3. Compute `secret_key = HMAC-SHA256("WebAppData", bot_token)`
 * 4. Compute `hash = HMAC-SHA256(secret_key, data_check_string)` (hex)
 * 5. Compare with the received hash
 * 6. Check auth_date is recent (< 1 hour ago)
 *
 * On success:
 *   - If a user with this telegram chat id exists → issue JWT, set cookie
 *   - If not → return { isNewUser: true, telegramUser: {...} } so the
 *     frontend can prompt for a username, then call this endpoint again
 *     with the username to create the account.
 */
async function handler(req: NextRequest) {
  try {
    const { initData, username } = await req.json();
    if (!initData || typeof initData !== "string") {
      return NextResponse.json({ error: "initData required" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error("[webapp-auth] TELEGRAM_BOT_TOKEN not set");
      return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
    }

    // Parse initData as URLSearchParams
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      return NextResponse.json({ error: "Missing hash in initData" }, { status: 400 });
    }

    // Build data_check_string: remove hash, sort keys alphabetically,
    // join as "k=v\nk=v\n..."
    params.delete("hash");
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join("\n");

    // Compute secret_key = HMAC-SHA256("WebAppData", bot_token)
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();

    // Compute hash = HMAC-SHA256(secret_key, data_check_string) hex
    const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    // Timing-safe comparison
    if (computedHash.length !== hash.length) {
      return NextResponse.json({ error: "Invalid hash" }, { status: 401 });
    }
    let diff = 0;
    for (let i = 0; i < computedHash.length; i++) {
      diff |= computedHash.charCodeAt(i) ^ hash.charCodeAt(i);
    }
    if (diff !== 0) {
      return NextResponse.json({ error: "Invalid hash" }, { status: 401 });
    }

    // Check auth_date is recent (< 1 hour ago)
    const authDate = parseInt(params.get("auth_date") || "0", 10);
    if (!authDate || Date.now() / 1000 - authDate > 3600) {
      return NextResponse.json({ error: "Auth data expired" }, { status: 401 });
    }

    // Extract user info
    const userJson = params.get("user");
    if (!userJson) {
      return NextResponse.json({ error: "Missing user in initData" }, { status: 400 });
    }
    let tgUser: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      photo_url?: string;
      language_code?: string;
    };
    try {
      tgUser = JSON.parse(userJson);
    } catch {
      return NextResponse.json({ error: "Invalid user JSON" }, { status: 400 });
    }

    const chatId = String(tgUser.id);

    // Check if user exists
    const existingUser = await database.findUserByTelegramChatId(chatId);

    // ── Existing user → log in ───────────────────────────────────────────
    if (existingUser) {
      if (existingUser.blocked) {
        return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
      }

      // Update telegramUsername if changed
      const newUsername = tgUser.username || existingUser.telegramUsername;
      if (newUsername !== existingUser.telegramUsername) {
        await database.updateUser(existingUser.id, { telegramUsername: newUsername });
      }

      const token = await signToken({
        userId: existingUser.id,
        username: existingUser.username,
        role: existingUser.role,
      });

      const response = NextResponse.json({
        ok: true,
        userId: existingUser.id,
        username: existingUser.username,
        role: existingUser.role,
        avatar: existingUser.avatar || null,
        telegramUsername: newUsername || null,
        isNewUser: false,
      });

      response.cookies.set(SESSION_COOKIE_OPTIONS.name, token, {
        httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
        secure: SESSION_COOKIE_OPTIONS.secure,
        sameSite: SESSION_COOKIE_OPTIONS.sameSite,
        maxAge: SESSION_COOKIE_OPTIONS.maxAge,
        path: SESSION_COOKIE_OPTIONS.path,
      });
      return response;
    }

    // ── New user ────────────────────────────────────────────────────────
    // If username is provided → create account
    if (username) {
      const usernameRegex = /^[a-zA-Z0-9_-]{2,20}$/;
      if (!usernameRegex.test(username)) {
        return NextResponse.json(
          { error: "Имя может содержать только буквы, цифры, _ и - (2-20 символов)" },
          { status: 400 }
        );
      }
      const reserved = ["admin", "administrator", "moderator", "support", "help", "system", "mq", "mqplayer", "root", "null", "undefined"];
      if (reserved.includes(username.toLowerCase())) {
        return NextResponse.json({ error: "Это имя зарезервировано" }, { status: 400 });
      }

      // Check if username already taken
      const existingByUsername = await database.findUserByUsername(username);
      if (existingByUsername) {
        return NextResponse.json(
          { error: "Это имя уже занято" },
          { status: 409 }
        );
      }

      // Generate placeholder email + random password (Telegram users don't need real ones)
      const placeholderEmail = `tg_${chatId}@mqplayer.telegram`;
      const randomPassword = require("crypto").randomUUID().replace(/-/g, "");
      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const user = await database.createUser({
        username,
        email: placeholderEmail,
        password: hashedPassword,
        confirmed: true,
        telegramChatId: chatId,
        telegramUsername: tgUser.username || null,
      });

      const token = await signToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      const response = NextResponse.json({
        ok: true,
        userId: user.id,
        username: user.username,
        role: user.role,
        avatar: user.avatar || null,
        telegramUsername: tgUser.username || null,
        isNewUser: true,
      });

      response.cookies.set(SESSION_COOKIE_OPTIONS.name, token, {
        httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
        secure: SESSION_COOKIE_OPTIONS.secure,
        sameSite: SESSION_COOKIE_OPTIONS.sameSite,
        maxAge: SESSION_COOKIE_OPTIONS.maxAge,
        path: SESSION_COOKIE_OPTIONS.path,
      });
      return response;
    }

    // New user, no username → ask frontend to prompt for one
    return NextResponse.json({
      ok: false,
      isNewUser: true,
      telegramUser: {
        id: tgUser.id,
        username: tgUser.username || null,
        first_name: tgUser.first_name || null,
        last_name: tgUser.last_name || null,
        photo_url: tgUser.photo_url || null,
      },
    });
  } catch (error) {
    console.error("[webapp-auth] error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(RATE_LIMITS.auth, handler);
