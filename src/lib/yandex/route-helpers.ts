/**
 * Yandex adapter error → NextResponse helper (shared by all /api/yandex routes).
 * Never exposes stack traces or internals to the client.
 */

import { NextResponse } from "next/server";
import { YandexError } from "./types";

export function yandexErrorResponse(err: unknown): NextResponse {
  if (err instanceof YandexError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.status || 502 }
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[yandex] unexpected route error:", message.slice(0, 200));
  return NextResponse.json(
    { error: "internal_error", message: "Внутренняя ошибка. Попробуйте позже." },
    { status: 500 }
  );
}
