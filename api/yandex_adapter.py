"""
MQ Player — Yandex Music server-side adapter.

A single-file, stateless bridge between MQ Player's Next.js API routes and
the unofficial `yandex-music` Python library
(https://github.com/MarshalX/yandex-music-api, pinned ==3.0.0 in requirements.txt).

Deployed as a file-based Vercel Python Function:
    api/yandex_adapter.py  ->  served at  /api/yandex_adapter

Contract
--------
GET  /api/yandex_adapter
     Unauthenticated health probe: {"ok": true, "service": ..., "yandex_music": "<version>"}

POST /api/yandex_adapter
     Signed JSON actions. Body: {"action": "<name>", ...payload}
     Headers:
       X-MQ-Timestamp: <unix seconds>
       X-MQ-Signature: hex(HMAC_SHA256(derived_secret, f"{timestamp}.{raw_body}"))
     where derived_secret = HMAC_SHA256(JWT_SECRET, b"mq-yandex-adapter-v1")
     (JWT_SECRET is the existing MQ session secret — same env var on both sides;
     the derived key is never the raw JWT_SECRET).

Actions
-------
  probe           -> same as GET (signature still required)
  device_start    -> Client().request_device_code()
                     returns {user_code, verification_url, device_code, expires_in, interval}
  device_poll     -> Client().poll_device_token(device_code)
                     returns {status: "pending"} |
                             {status: "authorized", access_token, refresh_token, expires_in, token_type}
  account         -> Client(token).init(); account_status()
                     returns {uid, login, display_name, full_name}
  playlists_list  -> Client(token).users_playlists_list()
                     returns {playlists: [{uid, kind, title, description, track_count,
                                           visibility, owner_login, cover_url,
                                           duration_ms, modified, collective}]}
  playlist_tracks -> Client(token).users_playlists(kind) (+ pager pagination)
                     + Client(token).tracks([...]) batch fetch for full metadata
                     returns {kind, uid, title, description, cover_url, track_count,
                              tracks: [{position, track_id, album_id, title, artists,
                                        album_title, album_id_full, duration_ms, available}]}

Security rules
--------------
* Yandex OAuth tokens are only ever passed THROUGH this function. They are
  never written to disk, never logged, and only returned to the signed
  server-to-server caller (a Next.js route that encrypts them at rest).
* No traceback ever leaves this function — all exceptions map to
  {"ok": false, "error": {"code": "<machine_code>", "message": "<safe ru text>"}}.
* The `yandex_music` logger is capped at WARNING so library debug output
  (which may contain request details) never floods function logs.
* Logs carry the action name only — never tokens.

Local development
-----------------
Run standalone (same handler class as on Vercel):
    JWT_SECRET=dev-secret python3 api/yandex_adapter.py --port 8787
Then point the Next.js side at it: YANDEX_ADAPTER_URL=http://127.0.0.1:8787/
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import logging
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional, Tuple

# ── Library imports (yandex-music==3.0.0, real public API only) ──────────────

import yandex_music
from yandex_music import Client
from yandex_music.exceptions import (
    BadRequestError,
    DeviceAuthError,
    NetworkError,
    TimedOutError,
    UnauthorizedError,
    YandexMusicError,
)

# The library uses stdlib logging; keep it quiet so serverless logs stay clean
# and never contain request/response details of authenticated calls.
logging.getLogger("yandex_music").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

# ── Constants ────────────────────────────────────────────────────────────────

SERVICE_NAME = "mq-yandex-adapter"
MAX_BODY_BYTES = 64 * 1024          # signed POST payloads are tiny
SIGNATURE_WINDOW_SECONDS = 300      # ±5 min clock skew
PLAYLIST_PAGE_SIZE = 100            # Yandex pager page size for big playlists
MAX_PLAYLIST_PAGES = 60             # hard safety cap (6000 tracks)
TRACK_BATCH_SIZE = 100              # client.tracks(...) batch chunk
COVER_SIZE = "300x300"

# ── HMAC helpers (must mirror src/lib/yandex/adapter.ts exactly) ─────────────


def _jwt_secret() -> bytes:
    secret = os.environ.get("JWT_SECRET", "")
    return secret.encode("utf-8")


def adapter_derived_secret() -> bytes:
    """Derived signing key: HMAC(JWT_SECRET, domain-separator). Never the raw JWT secret."""
    return hmac.new(_jwt_secret(), b"mq-yandex-adapter-v1", hashlib.sha256).digest()


def verify_signature(timestamp: str, signature: str, raw_body: bytes) -> Tuple[bool, str]:
    """Constant-time verification of the X-MQ-Signature header."""
    if not timestamp or not signature:
        return False, "missing_signature"
    try:
        ts = int(timestamp)
    except ValueError:
        return False, "bad_timestamp"
    now = int(time.time())
    if abs(now - ts) > SIGNATURE_WINDOW_SECONDS:
        return False, "stale_timestamp"
    if not _jwt_secret():
        return False, "adapter_secret_missing"
    payload = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(adapter_derived_secret(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature or ""):
        return False, "bad_signature"
    return True, ""


# ── Yandex call wrappers ─────────────────────────────────────────────────────


class AdapterError(Exception):
    """Sanitized adapter failure — code + human-safe Russian message."""

    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _map_yandex_error(exc: Exception) -> AdapterError:
    """Map yandex_music exceptions to structured codes. Never leak internals."""
    text = str(exc) or ""
    low = text.lower()
    if isinstance(exc, UnauthorizedError):
        return AdapterError(
            "yandex_unauthorized",
            "Токен Яндекс.Музыки недействителен или истёк. Повторите вход.",
            401,
        )
    if isinstance(exc, TimedOutError):
        return AdapterError("yandex_timeout", "Яндекс.Музыка не ответила вовремя. Попробуйте ещё раз.", 504)
    if isinstance(exc, DeviceAuthError):
        if "timed out" in low:
            return AdapterError("device_code_expired", "Код подтверждения истёк. Начните вход заново.", 400)
        if "cancelled" in low:
            return AdapterError("device_code_cancelled", "Ожидание подтверждения отменено.", 400)
        if "expired" in low:
            return AdapterError("device_code_expired", "Код подтверждения истёк. Начните вход заново.", 400)
        if "access_denied" in low:
            return AdapterError("device_access_denied", "Вход в Яндекс.Музыку отклонён.", 403)
        return AdapterError("device_auth_failed", "Не удалось завершить вход через Яндекс. Попробуйте снова.", 400)
    if isinstance(exc, NetworkError):
        if "429" in text or "too many requests" in low:
            return AdapterError("yandex_rate_limited", "Слишком много запросов к Яндекс.Музыке. Подождите немного.", 429)
        if isinstance(exc, BadRequestError):
            if "playlist" in low or "not found" in low or "404" in text:
                return AdapterError(
                    "yandex_not_found", "Плейлист недоступен: не найден или скрыт настройками приватности.", 404
                )
            return AdapterError("yandex_bad_request", "Яндекс.Музыка отклонила запрос. Попробуйте позже.", 502)
        return AdapterError("yandex_unavailable", "Яндекс.Музыка временно недоступна. Попробуйте позже.", 503)
    return AdapterError("yandex_error", "Ошибка обращения к Яндекс.Музыке. Попробуйте позже.", 502)


def _client(token: Optional[str] = None) -> Client:
    """Build a Client. For authorized actions pass the token."""
    try:
        if token:
            return Client(token)
        return Client()
    except Exception as exc:  # pragma: no cover — Client() ctor is trivial
        raise _map_yandex_error(exc) from exc


def _cover_url(playlist: Any) -> str:
    try:
        cover = getattr(playlist, "cover", None)
        if cover is not None:
            return cover.get_url(size=COVER_SIZE) or ""
    except Exception:
        pass
    return ""


def _owner_login(playlist: Any) -> str:
    owner = getattr(playlist, "owner", None)
    if owner is None:
        return ""
    return getattr(owner, "login", None) or getattr(owner, "display_name", None) or ""


def action_probe() -> Dict[str, Any]:
    return {
        "service": SERVICE_NAME,
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "yandex_music": getattr(yandex_music, "__version__", "3.0.0"),
    }


def action_device_start(payload: Dict[str, Any]) -> Dict[str, Any]:
    device_name = str(payload.get("device_name") or "MQ Player")
    client = _client()
    try:
        code = client.request_device_code(device_name=device_name)
    except Exception as exc:
        raise _map_yandex_error(exc) from exc
    if code is None:  # pragma: no cover — defensive
        raise AdapterError("device_code_failed", "Яндекс не выдал код подтверждения. Попробуйте позже.", 502)
    return {
        "user_code": code.user_code,
        "verification_url": code.verification_url,
        "device_code": code.device_code,
        "expires_in": code.expires_in,
        "interval": code.interval,
    }


def action_device_poll(payload: Dict[str, Any]) -> Dict[str, Any]:
    device_code = str(payload.get("device_code") or "")
    if not device_code:
        raise AdapterError("bad_request", "device_code обязателен.", 400)
    client = _client()
    try:
        token = client.poll_device_token(device_code)
    except Exception as exc:
        raise _map_yandex_error(exc) from exc
    if token is None:
        return {"status": "pending"}
    return {
        "status": "authorized",
        "access_token": token.access_token,
        "refresh_token": token.refresh_token or "",
        "expires_in": token.expires_in or 0,
        "token_type": token.token_type or "bearer",
    }


def action_account(payload: Dict[str, Any]) -> Dict[str, Any]:
    token = str(payload.get("token") or "")
    if not token:
        raise AdapterError("bad_request", "token обязателен.", 400)
    client = _client(token)
    try:
        client.init()
        status = client.account_status()
    except Exception as exc:
        raise _map_yandex_error(exc) from exc
    account = getattr(status, "account", None) if status else None
    return {
        "uid": getattr(account, "uid", None) if account else None,
        "login": getattr(account, "login", None) if account else None,
        "display_name": getattr(account, "display_name", None) if account else None,
        "full_name": getattr(account, "full_name", None) if account else None,
    }


def _playlist_brief(p: Any) -> Dict[str, Any]:
    return {
        "uid": p.uid,
        "kind": p.kind,
        "title": p.title or "",
        "description": p.description or "",
        "track_count": p.track_count if p.track_count is not None else (len(p.tracks) if p.tracks else 0),
        "visibility": p.visibility or "",
        "owner_login": _owner_login(p),
        "cover_url": _cover_url(p),
        "duration_ms": p.duration_ms or 0,
        "modified": p.modified or "",
        "collective": bool(p.collective),
    }


def action_playlists_list(payload: Dict[str, Any]) -> Dict[str, Any]:
    token = str(payload.get("token") or "")
    if not token:
        raise AdapterError("bad_request", "token обязателен.", 400)
    client = _client(token)
    try:
        client.init()
        playlists = client.users_playlists_list() or []
    except Exception as exc:
        raise _map_yandex_error(exc) from exc
    briefs = []
    for p in playlists:
        # Banner "playlists" are Yandex promo placeholders, not real playlists.
        if getattr(p, "is_banner", None):
            continue
        briefs.append(_playlist_brief(p))
    return {"playlists": briefs}


def _short_key(short: Any) -> str:
    return f"{short.id}:{short.album_id}" if getattr(short, "album_id", None) else f"{short.id}"


def _full_track_dict(full: Any) -> Dict[str, Any]:
    albums = getattr(full, "albums", None) or []
    first_album = albums[0] if albums else None
    return {
        "title": full.title or "",
        "artists": [a.name or "" for a in (full.artists or [])],
        "album_title": (first_album.title or "") if first_album else "",
        "album_id_full": str(first_album.id) if first_album else None,
        "duration_ms": full.duration_ms or 0,
        "available": bool(full.available),
    }


def _fetch_full_tracks(client: Client, shorts: List[Any]) -> Dict[str, Dict[str, Any]]:
    """Batch-fetch full Track objects for TrackShort entries via client.tracks()."""
    wanted: List[str] = [_short_key(s) for s in shorts]
    by_key: Dict[str, Dict[str, Any]] = {}
    for i in range(0, len(wanted), TRACK_BATCH_SIZE):
        chunk = wanted[i : i + TRACK_BATCH_SIZE]
        try:
            fulls = client.tracks(chunk) or []
        except Exception as exc:
            mapped = _map_yandex_error(exc)
            # Batch metadata fetch is best-effort: a failed chunk falls back to
            # TrackShort data instead of failing the whole playlist.
            logging.warning("tracks batch fetch failed (%s) — falling back to short data", mapped.code)
            continue
        for full in fulls:
            albums = getattr(full, "albums", None) or []
            key = f"{full.id}:{albums[0].id}" if albums else f"{full.id}"
            by_key[key] = _full_track_dict(full)
    return by_key


def action_playlist_tracks(payload: Dict[str, Any]) -> Dict[str, Any]:
    token = str(payload.get("token") or "")
    kind = payload.get("kind")
    if not token:
        raise AdapterError("bad_request", "token обязателен.", 400)
    if kind is None or str(kind) == "":
        raise AdapterError("bad_request", "kind обязателен.", 400)
    client = _client(token)
    try:
        client.init()
        playlist = client.users_playlists(kind)
        if playlist is None:
            raise AdapterError(
                "yandex_not_found", "Плейлист недоступен: не найден или скрыт настройками приватности.", 404
            )

        shorts: List[Any] = list(playlist.tracks or [])

        # Pagination: big playlists come back paged. The library forwards
        # `params` to the underlying GET request (documented **kwargs
        # passthrough of users_playlists) and exposes `playlist.pager`.
        pager = getattr(playlist, "pager", None)
        if pager is not None and pager.total and pager.total > len(shorts):
            page = 1
            while len(shorts) < pager.total and page < MAX_PLAYLIST_PAGES:
                try:
                    extra_pl = client.users_playlists(
                        kind, params={"page": page, "pagePageSize": PLAYLIST_PAGE_SIZE}
                    )
                except Exception as exc:
                    logging.warning("playlist page %s fetch failed: %s", page, _map_yandex_error(exc).code)
                    break
                if extra_pl is None or not extra_pl.tracks:
                    break
                shorts.extend(extra_pl.tracks)
                page += 1

        full_by_key = _fetch_full_tracks(client, shorts)

        tracks: List[Dict[str, Any]] = []
        for idx, s in enumerate(shorts):
            full = full_by_key.get(_short_key(s))
            if full is None:
                embedded = getattr(s, "track", None)
                if embedded is not None:
                    full = _full_track_dict(embedded)
            tracks.append(
                {
                    "position": idx,
                    "track_id": str(s.id),
                    "album_id": str(s.album_id) if getattr(s, "album_id", None) else None,
                    "title": (full or {}).get("title") or "",
                    "artists": (full or {}).get("artists") or [],
                    "album_title": (full or {}).get("album_title") or "",
                    "album_id_full": (full or {}).get("album_id_full"),
                    "duration_ms": (full or {}).get("duration_ms") or 0,
                    "available": (full or {}).get("available", True),
                }
            )

        return {
            "kind": playlist.kind,
            "uid": playlist.uid,
            "title": playlist.title or "",
            "description": playlist.description or "",
            "cover_url": _cover_url(playlist),
            "owner_login": _owner_login(playlist),
            "track_count": playlist.track_count or len(tracks),
            "tracks": tracks,
        }
    except AdapterError:
        raise
    except Exception as exc:
        raise _map_yandex_error(exc) from exc


# ── Action dispatch ──────────────────────────────────────────────────────────

ACTIONS = {
    "probe": lambda payload: action_probe(),
    "device_start": action_device_start,
    "device_poll": action_device_poll,
    "account": action_account,
    "playlists_list": action_playlists_list,
    "playlist_tracks": action_playlist_tracks,
}


# ── HTTP handler (Vercel runtime loads `handler`; stdlib server locally) ─────


class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel entrypoint name
    protocol_version = "HTTP/1.1"
    server_version = SERVICE_NAME

    # -- helpers -------------------------------------------------------------
    def _send_json(self, status: int, obj: Dict[str, Any]) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_error(self, status: int, code: str, message: str) -> None:
        self._send_json(status, {"ok": False, "error": {"code": code, "message": message}})

    def log_message(self, fmt: str, *args: Any) -> None:
        # Structured minimal logging: action info only, never payloads/tokens.
        sys.stderr.write("[%s] %s\n" % (SERVICE_NAME, fmt % args))

    # -- GET: health probe -----------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802 — stdlib naming
        if self.path.split("?")[0].rstrip("/") not in ("", "/", "/api/yandex_adapter", "/api/yandex_adapter.py"):
            self._send_error(404, "not_found", "Не найдено.")
            return
        self._send_json(200, {"ok": True, **action_probe()})

    # -- POST: signed actions --------------------------------------------------
    def do_POST(self) -> None:  # noqa: N802 — stdlib naming
        if self.path.split("?")[0].rstrip("/") not in ("", "/", "/api/yandex_adapter", "/api/yandex_adapter.py"):
            self._send_error(404, "not_found", "Не найдено.")
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self._send_error(413 if length > MAX_BODY_BYTES else 400, "bad_request", "Некорректное тело запроса.")
            return
        raw = self.rfile.read(length)

        ok, reason = verify_signature(
            self.headers.get("X-MQ-Timestamp") or "",
            self.headers.get("X-MQ-Signature") or "",
            raw,
        )
        if not ok:
            self._send_error(401, reason, "Запрос к адаптеру не авторизован.")
            return

        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("not an object")
        except (ValueError, UnicodeDecodeError):
            self._send_error(400, "bad_json", "Некорректный JSON.")
            return

        action = str(payload.get("action") or "")
        fn = ACTIONS.get(action)
        if fn is None:
            self._send_error(400, "unknown_action", f"Неизвестное действие: {action[:40]}")
            return

        try:
            data = fn(payload)
        except AdapterError as exc:
            sys.stderr.write("[%s] action=%s error=%s\n" % (SERVICE_NAME, action, exc.code))
            self._send_error(exc.status, exc.code, exc.message)
            return
        except Exception as exc:  # absolute last resort — never leak internals
            sys.stderr.write("[%s] action=%s unexpected_error=%s\n" % (SERVICE_NAME, action, type(exc).__name__))
            self._send_error(500, "adapter_internal", "Внутренняя ошибка адаптера. Попробуйте позже.")
            return

        self._send_json(200, {"ok": True, "data": data})


# ── Local standalone server ──────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="MQ Yandex adapter — local server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), handler)
    sys.stderr.write("[%s] listening on http://%s:%s\n" % (SERVICE_NAME, args.host, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
