#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MQ Yandex Relay — Yandex Cloud Function (ru-central1), serverless HTTP.

A stdlib-only, tokenless RU-egress implementation of the MQ Yandex ADAPTER
PROTOCOL (must mirror api/yandex_adapter.py + src/lib/yandex/adapter.ts):

  GET  /  → health probe (unauthenticated):
        {"ok": true, "service": "mq-yandex-yc-relay", "python": "...",
         "yandex_music": "yc-relay-stdlib", "proxy_configured": false}

  POST /  → signed JSON actions. Body: {"action": "<name>", ...}
        Headers:
          X-MQ-Timestamp: <unix SECONDS>
          X-MQ-Signature: hex(HMAC_SHA256(derived_secret, f"{timestamp}.{raw_body}"))
        derived_secret = HMAC_SHA256(JWT_SECRET, b"mq-yandex-adapter-v1")

Supported actions (public, tokenless — NO OAuth, NO tokens, NO cookies):
  probe           → same as GET (signature still required)
  public_playlist → {"user_id": "<login|uid>", "kind": "<int>"}
                     or {"playlist_uuid": "<uuid>"}
                     GET https://api.music.yandex.net/users/{u}/playlists/{k}
                     or GET https://api.music.yandex.net/playlist/{uuid}
                     Same data contract as the Vercel adapter:
                     {kind, uid, title, description, cover_url, owner_login,
                      track_count, tracks: [{position, track_id, album_id,
                      title, artists[], album_title, album_id_full,
                      duration_ms, available}]}

Unsupported actions (device/account OAuth family) fail fast with
{"ok": false, "error": {"code": "unsupported_action", ...}} — the OAuth
import path intentionally does NOT run on the RU relay.

Error codes (same as the adapter): bad_request 400 · yandex_not_found 404 ·
yandex_geo_blocked 503 (upstream 451) · yandex_timeout 504 ·
yandex_unavailable 503 · yandex_error 502 · unauthorized 401.

Security:
  - HMAC verified in constant time; ±5 min replay window; wrong signature →
    {"ok": false, "error": {"code": "unauthorized", ...}} 401.
  - Structured params ONLY — a URL is never accepted, so this function can
    never act as an open proxy (SSRF-safe by construction).
  - The outbound Yandex call NEVER sets Authorization/Cookie headers.
  - JWT_SECRET never logged.

Deploy: see DEPLOY.md (yc CLI; python312, 128 MB, 30 s, env JWT_SECRET).
"""
import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API_BASE = "https://api.music.yandex.net"
DERIVED_INFO = b"mq-yandex-adapter-v1"
SIGNATURE_WINDOW_SECONDS = 300  # ±5 min clock skew (same as the adapter)
PLAYLIST_PAGE_SIZE = 100
MAX_PLAYLIST_PAGES = 60
PUBLIC_USER_AGENT = "TelegramBot"
COVER_SIZE = "300x300"
SERVICE_NAME = "mq-yandex-yc-relay"

OWNER_RE = re.compile(r"^[a-zA-Z0-9._-]{1,64}$")
KIND_RE = re.compile(r"^[1-9][0-9]{0,9}$")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


# ── HMAC (mirrors api/yandex_adapter.py::verify_signature exactly) ──────────

def _jwt_secret() -> bytes:
    return (os.environ.get("JWT_SECRET") or "").encode("utf-8")


def adapter_derived_secret() -> bytes:
    return hmac.new(_jwt_secret(), DERIVED_INFO, hashlib.sha256).digest()


def verify_signature(timestamp, signature, raw_body: bytes):
    """Constant-time verification of X-MQ-Signature. Returns (ok, reason)."""
    if not timestamp or not signature:
        return False, "missing_signature"
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False, "bad_timestamp"
    now = int(time.time())
    if abs(now - ts) > SIGNATURE_WINDOW_SECONDS:
        return False, "stale_timestamp"
    if not _jwt_secret():
        return False, "adapter_secret_missing"
    payload = str(timestamp).encode("utf-8") + b"." + raw_body
    expected = hmac.new(adapter_derived_secret(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature or ""):
        return False, "bad_signature"
    return True, ""


class RelayError(Exception):
    """Sanitized failure — code + human-safe Russian message (adapter codes)."""

    def __init__(self, code, message, status=502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# ── Tokenless Yandex public API GET (NO credentials, ever) ───────────────────

def _upstream_get(url, timeout=20):
    """GET to the public Yandex Music API. Authorization/Cookie never set."""
    req = urllib.request.Request(url, headers={
        "User-Agent": PUBLIC_USER_AGENT,
        "Accept": "application/json",
        "Accept-Language": "ru-RU,ru;q=0.9",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, body
    except Exception as e:
        name = type(e).__name__
        if "timeout" in str(e).lower() or "timed out" in str(e).lower():
            return None, json.dumps({"__relay__": "timeout", "detail": name})
        return None, json.dumps({"__relay__": "network", "detail": name})


def _map_upstream(status, body):
    """Map the raw upstream outcome to RelayError codes (adapter-compatible)."""
    if status is None:
        try:
            detail = json.loads(body).get("__relay__")
        except Exception:
            detail = "network"
        if detail == "timeout":
            raise RelayError("yandex_timeout", "Яндекс.Музыка не ответила вовремя. Попробуйте ещё раз.", 504)
        raise RelayError("yandex_unavailable", "Яндекс.Музыка временно недоступна. Попробуйте позже.", 503)
    if status == 451:
        raise RelayError(
            "yandex_geo_blocked",
            "Яндекс.Музыка ограничивает доступ к плейлистам по региону. "
            "Импорт по ссылке временно недоступен с нашего сервера — попробуйте позже.",
            503,
        )
    if status == 404:
        raise RelayError(
            "yandex_not_found",
            "Плейлист не найден. Проверьте ссылку — плейлист может быть приватным или удалённым.",
            404,
        )
    if status == 429:
        raise RelayError("yandex_rate_limited", "Слишком много запросов к Яндекс.Музыке. Подождите немного.", 429)
    if status != 200:
        raise RelayError("yandex_unavailable", "Яндекс.Музыка временно недоступна. Попробуйте позже.", 503)


# ── Normalization into the MQ adapter data contract ──────────────────────────

def _playlist_from_payload(payload):
    """Unwrap {invocationInfo, result:{…}} / {playlist:{…}} / bare playlist."""
    if not isinstance(payload, dict):
        return None
    for key in ("result", "playlist"):
        v = payload.get(key)
        if isinstance(v, dict) and ("title" in v or "tracks" in v):
            return v
    if isinstance(payload.get("title"), str) and isinstance(payload.get("tracks"), list):
        return payload
    return None


def _cover_url(pl):
    """Mirror the adapter's cover.get_url(300x300)."""
    try:
        uri = pl.get("ogImage") or (pl.get("cover") or {}).get("uri") or ""
        uri = str(uri)
        if not uri:
            return ""
        uri = uri.replace("%%", COVER_SIZE)
        if uri.startswith("//"):
            return "https:" + uri
        if uri.startswith("http"):
            return uri
        if uri.startswith("avatars."):
            return "https://" + uri
        return "https://music.yandex.ru/" + uri.lstrip("/")
    except Exception:
        return ""


def _track_dict(idx, entry):
    """One playlist track entry → adapter track dict (full metadata embedded)."""
    track = entry.get("track") if isinstance(entry, dict) and isinstance(entry.get("track"), dict) else {}
    artists = [a.get("name") or "" for a in (track.get("artists") or [])]
    albums = track.get("albums") or []
    first_album = albums[0] if albums else {}
    return {
        "position": idx,
        "track_id": str(entry.get("id")) if entry.get("id") is not None else "",
        "album_id": str(first_album.get("id")) if first_album.get("id") is not None else None,
        "title": track.get("title") or "",
        "artists": artists,
        "album_title": first_album.get("title") or "",
        "album_id_full": str(first_album.get("id")) if first_album.get("id") is not None else None,
        "duration_ms": track.get("durationMs") or 0,
        "available": bool(track.get("available", True)),
    }


def _normalize_playlist(pl):
    owner = pl.get("owner") if isinstance(pl.get("owner"), dict) else {}
    tracks = [_track_dict(i, e) for i, e in enumerate(pl.get("tracks") or [])]
    track_count = pl.get("trackCount")
    if not isinstance(track_count, int):
        track_count = len(tracks)
    return {
        "kind": pl.get("kind"),
        "uid": pl.get("uid") if isinstance(pl.get("uid"), int) else None,
        "title": pl.get("title") or "",
        "description": pl.get("description") or "",
        "cover_url": _cover_url(pl),
        "owner_login": owner.get("login") or owner.get("name") or "",
        "track_count": track_count,
        "tracks": tracks,
    }


# ── Actions ──────────────────────────────────────────────────────────────────

def action_probe():
    return {
        "service": SERVICE_NAME,
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "yandex_music": "yc-relay-stdlib",  # tokenless public API only, no lib
        "proxy_configured": False,          # RU egress is native — no proxy needed
    }


def action_public_playlist(payload):
    """Tokenless public playlist fetch (owner+kind or UUID). NO credentials."""
    user_id = payload.get("user_id")
    kind = payload.get("kind")
    playlist_uuid = payload.get("playlist_uuid")
    user_id = str(user_id).strip() if user_id is not None else ""
    playlist_uuid = str(playlist_uuid).strip().lower() if playlist_uuid is not None else ""

    by_uuid = bool(playlist_uuid)
    if by_uuid:
        if user_id or kind is not None:
            raise RelayError("bad_request", "Некорректный запрос: укажите только UUID плейлиста.", 400)
        if not UUID_RE.match(playlist_uuid):
            raise RelayError("bad_request", "Некорректный идентификатор плейлиста.", 400)
        first_url = f"{API_BASE}/playlist/{playlist_uuid}"
    else:
        if not user_id or not OWNER_RE.match(user_id):
            raise RelayError("bad_request", "Некорректный владелец плейлиста.", 400)
        if kind is None or not str(kind).isdigit() or int(str(kind)) <= 0:
            raise RelayError("bad_request", "Некорректный идентификатор плейлиста.", 400)
        first_url = f"{API_BASE}/users/{user_id}/playlists/{int(str(kind))}"

    status, body = _upstream_get(first_url)
    _map_upstream(status, body)
    try:
        payload_json = json.loads(body)
    except Exception:
        raise RelayError("yandex_error", "Ошибка обращения к Яндекс.Музыке. Попробуйте позже.", 502)

    pl = _playlist_from_payload(payload_json)
    if pl is None:
        raise RelayError(
            "yandex_not_found",
            "Плейлист не найден. Проверьте ссылку — плейлист может быть приватным или удалённым.",
            404,
        )

    # Pagination for the owner+kind form (uuid returns the full snapshot).
    pager = pl.get("pager") or {}
    total = pager.get("total") if isinstance(pager, dict) else None
    if (
        not by_uuid
        and isinstance(total, int)
        and total > len(pl.get("tracks") or [])
        and user_id
        and kind is not None
    ):
        page = 1
        while len(pl.get("tracks") or []) < total and page < MAX_PLAYLIST_PAGES:
            url = f"{API_BASE}/users/{user_id}/playlists/{int(str(kind))}?page={page}&pagePageSize={PLAYLIST_PAGE_SIZE}"
            status, body = _upstream_get(url)
            if status != 200:
                break  # partial result is acceptable — same contract as adapter
            try:
                extra = _playlist_from_payload(json.loads(body))
            except Exception:
                break
            if not extra or not extra.get("tracks"):
                break
            pl["tracks"].extend(extra["tracks"])
            page += 1

    data = _normalize_playlist(pl)
    if not data["tracks"]:
        raise RelayError(
            "yandex_not_found",
            "Плейлист не найден. Проверьте ссылку — плейлист может быть приватным или удалённым.",
            404,
        )
    return data


ACTIONS = {
    "probe": lambda payload: action_probe(),
    "public_playlist": action_public_playlist,
}


# ── Yandex Cloud Function entrypoint ────────────────────────────────────────

def _respond(status, obj):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"},
        "body": json.dumps(obj, ensure_ascii=False),
    }


def handler(event, context):
    method = (event.get("httpMethod") or "GET").upper()
    headers = {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}
    raw_body = event.get("body") or "{}"
    if isinstance(raw_body, (bytes, bytearray)):
        raw_body = raw_body.decode("utf-8", "replace")
    raw_bytes = raw_body.encode("utf-8")

    # Unauthenticated health probe (GET) — same contract as the adapter's GET.
    if method == "GET":
        return _respond(200, {"ok": True, **action_probe()})

    if method != "POST":
        return _respond(405, {"ok": False, "error": {"code": "bad_request", "message": "Метод не поддерживается."}})

    # Verify the internal MQ signature first — everything else is rejected.
    ok, reason = verify_signature(headers.get("x-mq-timestamp"), headers.get("x-mq-signature"), raw_bytes)
    if not ok:
        return _respond(401, {"ok": False, "error": {"code": "unauthorized", "message": "Запрос не авторизован."}})

    try:
        envelope = json.loads(raw_body)
    except Exception:
        return _respond(400, {"ok": False, "error": {"code": "bad_request", "message": "Некорректное тело запроса."}})
    if not isinstance(envelope, dict):
        return _respond(400, {"ok": False, "error": {"code": "bad_request", "message": "Некорректное тело запроса."}})

    action = envelope.get("action")
    fn = ACTIONS.get(action) if isinstance(action, str) else None
    if fn is None:
        # OAuth-family actions intentionally unsupported on the RU relay.
        return _respond(400, {
            "ok": False,
            "error": {
                "code": "unsupported_action",
                "message": "Действие не поддерживается релеем. Поддерживаются: probe, public_playlist.",
            },
        })

    try:
        data = fn(envelope)
    except RelayError as e:
        return _respond(e.status, {"ok": False, "error": {"code": e.code, "message": e.message}})
    except Exception:
        return _respond(502, {"ok": False, "error": {"code": "yandex_error", "message": "Ошибка обращения к Яндекс.Музыке. Попробуйте позже."}})

    return _respond(200, {"ok": True, "data": data})


if __name__ == "__main__":
    # Local self-test (signed probe + public_playlist against the real API —
    # from a non-RU egress the latter honestly maps to yandex_geo_blocked).
    os.environ.setdefault("JWT_SECRET", "dev-secret")
    ts = str(int(time.time()))
    body = json.dumps({"action": "probe"})
    sig = hmac.new(adapter_derived_secret(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    out = handler({"httpMethod": "POST", "headers": {"X-MQ-Timestamp": ts, "X-MQ-Signature": sig}, "body": body}, None)
    print("probe:", out["statusCode"], out["body"])
    ts = str(int(time.time()))
    body = json.dumps({"action": "public_playlist", "user_id": "music.partners", "kind": "1293"})
    sig = hmac.new(adapter_derived_secret(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    out = handler({"httpMethod": "POST", "headers": {"X-MQ-Timestamp": ts, "X-MQ-Signature": sig}, "body": body}, None)
    print("public_playlist:", out["statusCode"], out["body"][:300])
