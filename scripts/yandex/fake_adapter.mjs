#!/usr/bin/env node
/**
 * LOCAL E2E ONLY — fake Yandex adapter.
 *
 * Implements the EXACT JSON+HMAC contract of api/yandex_adapter.py (the real
 * Vercel Python function) but with canned data, so the full MQ stack
 * (Next.js routes → engine → DB → UI) can be exercised end-to-end locally
 * without a real Yandex account.
 *
 *   device_start → fixed user_code + device_code
 *   device_poll  → "pending" twice, then "authorized" with a fake token
 *   account      → fixed account
 *   playlists_list / playlist_tracks → canned playlists with well-known songs
 *
 * Run: JWT_SECRET=<same as dev server> node scripts/yandex/fake_adapter.mjs 8789
 */

import crypto from "crypto";
import http from "http";

const PORT = Number(process.argv[2] || 8789);
const SECRET = process.env.JWT_SECRET || "";

function derivedSecret() {
  return crypto.createHmac("sha256", SECRET).update("mq-yandex-adapter-v1").digest();
}

function verifySig(ts, sig, body) {
  if (!ts || !sig || !SECRET) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 300) return false;
  const expected = crypto
    .createHmac("sha256", derivedSecret())
    .update(`${ts}.${body}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig || "0".repeat(expected.length)));
}

const pollCounters = new Map();

// Canned playlists — titles chosen so SoundCloud search finds real matches
const PLAYLISTS = [
  {
    uid: 100500, kind: 3, title: "Мне нравится", description: "Любимые треки",
    track_count: 3, visibility: "public", owner_login: "test.yandex.user",
    cover_url: "", duration_ms: 600000, modified: "2026-01-01", collective: false,
  },
  {
    uid: 100500, kind: 1001, title: "Классика рока", description: "Проверка порядка",
    track_count: 4, visibility: "public", owner_login: "test.yandex.user",
    cover_url: "", duration_ms: 1200000, modified: "2026-02-02", collective: false,
  },
  {
    uid: 100500, kind: 1002, title: "Несуществующие треки", description: "Для отчёта о не найденных",
    track_count: 2, visibility: "private", owner_login: "test.yandex.user",
    cover_url: "", duration_ms: 300000, modified: "2026-03-03", collective: false,
  },
];

function track(id, albumId, title, artists, durSec, albumTitle = "Album") {
  return {
    position: 0, track_id: String(id), album_id: String(albumId), title,
    artists, album_title: albumTitle, album_id_full: String(albumId),
    duration_ms: durSec * 1000, available: true,
  };
}

const PLAYLIST_TRACKS = {
  3: {
    kind: 3, uid: 100500, title: "Мне нравится", description: "Любимые треки",
    cover_url: "", owner_login: "test.yandex.user", track_count: 3,
    tracks: [
      track(70001, 80001, "Bohemian Rhapsody", ["Queen"], 355),
      track(70002, 80002, "Wind of Change", ["Scorpions"], 311),
      track(70003, 80003, "Nothing Else Matters", ["Metallica"], 388),
    ],
  },
  1001: {
    kind: 1001, uid: 100500, title: "Классика рока", description: "Проверка порядка",
    cover_url: "", owner_login: "test.yandex.user", track_count: 4,
    tracks: [
      track(70011, 80011, "Smells Like Teen Spirit", ["Nirvana"], 301),
      track(70012, 80012, "Creep", ["Radiohead"], 238),
      track(70011, 80011, "Smells Like Teen Spirit", ["Nirvana"], 301), // DUPLICATE (order semantics)
      track(70013, 80013, "Звезда по имени Солнце", ["Кино"], 286),
    ],
  },
  1002: {
    kind: 1002, uid: 100500, title: "Несуществующие треки", description: "",
    cover_url: "", owner_login: "test.yandex.user", track_count: 2,
    tracks: [
      track(70021, 80021, "Абсолютно неизвестная композиция зхзх", ["Никто Такой"], 200),
      track(70022, 80022, "ZZXX YYQQ WW_unused", ["Qqzz Wwxx"], 180),
    ],
  },
};

const server = http.createServer((req, res) => {
  const send = (status, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
  };

  if (req.method === "GET") {
    return send(200, { ok: true, service: "fake-yandex-adapter", python: "3.12.14", yandex_music: "3.0.0" });
  }
  if (req.method !== "POST") return send(404, { ok: false, error: { code: "not_found", message: "Не найдено." } });

  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (!verifySig(req.headers["x-mq-timestamp"], req.headers["x-mq-signature"], raw)) {
      return send(401, { ok: false, error: { code: "missing_signature", message: "Запрос к адаптеру не авторизован." } });
    }
    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      return send(400, { ok: false, error: { code: "bad_json", message: "Некорректный JSON." } });
    }
    switch (payload.action) {
      case "probe":
        return send(200, { ok: true, data: { service: "fake-yandex-adapter", python: "3.12.14", yandex_music: "3.0.0" } });
      case "device_start":
        return send(200, {
          ok: true,
          data: {
            user_code: "E2ETEST",
            verification_url: "https://ya.ru/device",
            device_code: "fake-device-code-e2e",
            expires_in: 300,
            interval: 2,
          },
        });
      case "device_poll": {
        const n = (pollCounters.get(payload.device_code) || 0) + 1;
        pollCounters.set(payload.device_code, n);
        if (n < 3) return send(200, { ok: true, data: { status: "pending" } });
        return send(200, {
          ok: true,
          data: {
            status: "authorized",
            access_token: "fake-e2e-access-token",
            refresh_token: "fake-e2e-refresh-token",
            expires_in: 31536000,
            token_type: "bearer",
          },
        });
      }
      case "account":
        return send(200, {
          ok: true,
          data: { uid: 100500, login: "test.yandex.user", display_name: "E2E Yandex User", full_name: "E2E" },
        });
      case "playlists_list":
        return send(200, { ok: true, data: { playlists: PLAYLISTS } });
      case "playlist_tracks": {
        const pl = PLAYLIST_TRACKS[payload.kind];
        if (!pl) return send(404, { ok: false, error: { code: "yandex_not_found", message: "Плейлист недоступен." } });
        const withPositions = { ...pl, tracks: pl.tracks.map((t, i) => ({ ...t, position: i })) };
        return send(200, { ok: true, data: withPositions });
      }
      case "public_playlist": {
        // Tokenless public fetch by (user_id, kind). Special canned users:
        //   geo.blocked   → 451-style geo error (as real Yandex returns abroad)
        //   private.user  → not found (private playlist semantics)
        //   empty.user    → playlist exists but has zero tracks
        const user = String(payload.user_id || "");
        if (user === "geo.blocked") {
          return send(503, {
            ok: false,
            error: {
              code: "yandex_geo_blocked",
              message: "Яндекс.Музыка ограничивает доступ к плейлистам по региону. Импорт по ссылке временно недоступен с нашего сервера — попробуйте позже.",
            },
          });
        }
        if (user === "private.user") {
          return send(404, {
            ok: false,
            error: { code: "yandex_not_found", message: "Плейлист недоступен: не найден или скрыт настройками приватности." },
          });
        }
        if (user === "empty.user") {
          return send(200, {
            ok: true,
            data: { kind: Number(payload.kind) || 1, uid: 1, title: "Пустой", description: "", cover_url: "", owner_login: user, track_count: 0, tracks: [] },
          });
        }
        // Default: any user gets the canned public playlists (kind-keyed).
        const pl = PLAYLIST_TRACKS[payload.kind];
        if (!pl) return send(404, { ok: false, error: { code: "yandex_not_found", message: "Плейлист недоступен: не найден или скрыт настройками приватности." } });
        const withPositions = { ...pl, owner_login: user, tracks: pl.tracks.map((t, i) => ({ ...t, position: i })) };
        return send(200, { ok: true, data: withPositions });
      }
      default:
        return send(400, { ok: false, error: { code: "unknown_action", message: "Неизвестное действие." } });
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[fake-yandex-adapter] http://127.0.0.1:${PORT} (HMAC ${SECRET ? "on" : "OFF"})`);
});
