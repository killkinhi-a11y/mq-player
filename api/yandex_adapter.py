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
  public_playlist -> tokenless Client().users_playlists(kind, user_id=...) — PUBLIC
                     playlist by URL (no OAuth, no user token, no cookies).
                     The TelegramBot User-Agent is applied for this action only
                     (server-side; yandex-music otherwise forces "Yandex-Music-API").
                     Same pagination + batch track normalization as playlist_tracks.
                     Yandex geo-fences content: 451 from unsupported regions maps
                     to the yandex_geo_blocked error code.

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

Optional egress proxy
---------------------
Yandex geo-fences music CONTENT (451) for server egress outside RU/CIS
(factual: HK, US and Vercel iad1 all receive 451 while /genres answers 200
from the same IPs). Setting the YANDEX_PROXY_URL env var routes ALL Yandex
API traffic through the given proxy via the library's NATIVE support
(Request(proxy_url=...) — no monkey-patching):

    YANDEX_PROXY_URL=http://user:pass@ru-host:8080      (http/https)
    YANDEX_PROXY_URL=socks5://user:pass@ru-host:1080    (socks4/5/5h, PySocks)

Any RU/CIS proxy/VPS works; after the var is set, BOTH the public URL import
and the OAuth import work unchanged. Proxy failures map to the distinct
yandex_proxy_error code (never confused with Yandex downtime). The URL may
embed credentials — it is read server-side only, never logged, never
returned to clients (probe exposes only proxy_configured: true/false).

Built-in RU/CIS egress chain (zero-config fallback)
----------------------------------------------------
When YANDEX_PROXY_URL is NOT set, the tokenless public_playlist action
routes through a small built-in chain of PUBLIC no-credentials HTTP CONNECT
relays with RU/CIS egress (canary-verified against Yandex's 451 content
fence). Candidates are tried in order starting from the last known-good one
(warm-start sticky); a dead/slow/fenced candidate fails over to the next.
Real Yandex answers (404/400/429/401) fail fast. This makes the public URL
import work out of the box from any Vercel region with zero configuration
and ZERO Yandex credentials (the relay only ever makes anonymous GETs).
Operator upgrade paths, both still one step each and BOTH override the
chain completely: set YANDEX_PROXY_URL (private RU/CIS proxy) or wire
YANDEX_ADAPTER_URL to a RU relay (download/yc-relay — HMAC-protocol
identical, native RU egress).

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
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlsplit

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

# Public (tokenless) requests historically require a non-library User-Agent:
# yandex-music otherwise forces "Yandex-Music-API" on every request via
# RequestBase._prepare_kwargs. Server-side only — never sent from a browser.
PUBLIC_USER_AGENT = "TelegramBot"
PLAYLIST_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

# Optional egress proxy for ALL Yandex API traffic (YANDEX_PROXY_URL env var).
# api.music.yandex.net geo-fences music CONTENT (451) for non-RU/CIS egress —
# verified factually from HK + US + Vercel iad1. Setting this var routes every
# Yandex call through the proxy (e.g. a RU/CIS host), after which public and
# OAuth imports work unchanged. The proxy URL may contain credentials; it is
# read server-side only and NEVER returned to clients or logs.
PROXY_ENV = "YANDEX_PROXY_URL"
MAX_PROXY_URL_LEN = 512
ALLOWED_PROXY_SCHEMES = ("http", "https", "socks5", "socks5h", "socks4")

# Built-in RU/CIS egress chain — the ZERO-CONFIG fallback used ONLY when
# YANDEX_PROXY_URL is unset (and only for the tokenless public_playlist
# action). Public no-credentials HTTP CONNECT relays, canary-verified against
# Yandex's 451 content fence on 2026-10-03: each returned HTTP 200 + the real
# playlist JSON for music.partners/1293 from non-RU hosting. The operator's
# env var ALWAYS wins (validated, single proxy, byte-identical legacy path);
# wiring YANDEX_ADAPTER_URL to a RU relay (download/yc-relay) bypasses this
# adapter entirely. No credentials are involved anywhere in the chain.
DEFAULT_EGRESS_PROXIES: Tuple[str, ...] = (
    "http://193.37.71.46:10808",
    "http://195.19.217.200:3128",
    "http://194.186.246.22:8888",
)
# Public relays are slower than a private VPS proxy, and the library default
# is only 5 s per request — raise the per-request budget for chain attempts.
EGRESS_CHAIN_TIMEOUT_S = 15
# Codes that mean "this CANDIDATE failed", not "Yandex answered": dead relay
# (proxy_error), network trouble (unavailable), per-request timeout, or the
# 451 fence (the relay stopped counting as RU egress). Real Yandex answers
# (not found / bad request / rate limit / unauthorized) fail fast — retrying
# them through another egress would only duplicate the same verdict.
EGRESS_RETRYABLE_CODES = ("yandex_proxy_error", "yandex_unavailable", "yandex_timeout", "yandex_geo_blocked")
# Module-level sticky index of the last working candidate (survives warm
# starts) so subsequent invocations try the known-good relay first.
_default_egress_index = 0

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


PROXY_BAD_CONFIG_MESSAGE = (
    "Импорт по ссылке временно недоступен из-за настроек сервера. Попробуйте позже."
)
PROXY_UNREACHABLE_MESSAGE = (
    "Импорт по ссылке временно недоступен с нашего сервера — попробуйте позже."
)


def _raw_proxy_url() -> str:
    """Raw YANDEX_PROXY_URL presence (no validation) — safe for probes."""
    return (os.environ.get(PROXY_ENV) or "").strip()


def _validated_proxy_url(raw: str) -> str:
    """Validate a proxy URL (scheme allowlist + real host). Raises on bad input."""
    if len(raw) > MAX_PROXY_URL_LEN:
        raise AdapterError("yandex_proxy_error", PROXY_BAD_CONFIG_MESSAGE, 503)
    try:
        parts = urlsplit(raw)
    except ValueError:
        raise AdapterError("yandex_proxy_error", PROXY_BAD_CONFIG_MESSAGE, 503) from None
    # Scheme allowlist (no file/gopher/smuggling) + a real host part —
    # urlsplit("https://:8080").hostname is "" and is rejected below.
    if parts.scheme.lower() not in ALLOWED_PROXY_SCHEMES or not parts.hostname:
        raise AdapterError("yandex_proxy_error", PROXY_BAD_CONFIG_MESSAGE, 503)
    return raw


def _proxy_url() -> Optional[str]:
    """Validated YANDEX_PROXY_URL or None.

    Raises AdapterError(yandex_proxy_error) on malformed configuration so the
    operator gets a distinct, actionable code instead of generic Yandex
    downtime. Never logs or returns the URL itself (it may embed credentials).
    """
    raw = _raw_proxy_url()
    if not raw:
        return None
    return _validated_proxy_url(raw)


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
        # A configured egress proxy that itself fails (dead host, refused
        # connection, missing SOCKS support) must NOT be reported as generic
        # Yandex downtime — surface the distinct yandex_proxy_error code so
        # the operator can tell proxy trouble apart from Yandex trouble.
        if _raw_proxy_url():
            cause = getattr(exc, "__cause__", None)
            cause_name = type(cause).__name__ if cause is not None else ""
            if cause_name in ("ProxyError", "InvalidSchema") or "proxy" in low or "socks" in low:
                return AdapterError("yandex_proxy_error", PROXY_UNREACHABLE_MESSAGE, 503)
        if "429" in text or "too many requests" in low:
            return AdapterError("yandex_rate_limited", "Слишком много запросов к Яндекс.Музыке. Подождите немного.", 429)
        # 451 Unavailable For Legal Reasons — Yandex geo-fences music CONTENT
        # (playlists/tracks/search) by the caller's region. Verified factually:
        # HK + US egress both receive 451 while /genres works from the same IP.
        if "451" in text or "unavailable for legal reasons" in low:
            return AdapterError(
                "yandex_geo_blocked",
                "Яндекс.Музыка ограничивает доступ к плейлистам по региону. "
                "Импорт по ссылке временно недоступен с нашего сервера — попробуйте позже.",
                503,
            )
        if isinstance(exc, BadRequestError):
            if "playlist" in low or "not found" in low or "404" in text:
                return AdapterError(
                    "yandex_not_found", "Плейлист недоступен: не найден или скрыт настройками приватности.", 404
                )
            return AdapterError("yandex_bad_request", "Яндекс.Музыка отклонила запрос. Попробуйте позже.", 502)
        return AdapterError("yandex_unavailable", "Яндекс.Музыка временно недоступна. Попробуйте позже.", 503)
    return AdapterError("yandex_error", "Ошибка обращения к Яндекс.Музыке. Попробуйте позже.", 502)


def _client(token: Optional[str] = None, proxy_url: Optional[str] = None, timeout: Optional[float] = None) -> Client:
    """Build a Client. For authorized actions pass the token.

    When YANDEX_PROXY_URL is configured, the client's Request is constructed
    with proxy_url (NATIVE library support — RequestBase builds
    proxies={'http': url, 'https': url} and passes them on every request), so
    ALL Yandex traffic traverses the proxy without any monkey-patching.
    Malformed proxy config raises AdapterError(yandex_proxy_error) before
    the first network call.

    An explicit ``proxy_url`` (the built-in default egress chain) overrides
    the env var for this client and pairs with ``timeout``; the default
    ``None``/``None`` keeps the legacy env-driven path byte-identical.
    """
    proxy = _validated_proxy_url(proxy_url) if proxy_url is not None else _proxy_url()  # None when unset; raises on malformed config
    try:
        if proxy:
            from yandex_music.utils.request import Request as _YmRequest

            requester = _YmRequest(proxy_url=proxy, timeout=timeout) if timeout is not None else _YmRequest(proxy_url=proxy)
            if token:
                return Client(token, request=requester)
            return Client(request=requester)
        if token:
            return Client(token)
        return Client()
    except AdapterError:
        raise
    except Exception as exc:  # pragma: no cover — Client() ctor is trivial
        raise _map_yandex_error(exc) from exc


def _run_public_with_default_egress(fetch):
    """Run the tokenless public fetch through the built-in RU/CIS egress chain.

    ``fetch(proxy_url, timeout)`` performs the real network work with the
    Client built from the given candidate. Behaviour matrix:

    - YANDEX_PROXY_URL set  -> exactly one call ``fetch(None, None)`` — the
      operator's proxy is used by ``_client`` via the env path (legacy
      behaviour, no failover, byte-identical error mapping).
    - env unset             -> try the built-in candidates in order, starting
      from the last known-good one (warm-start sticky). Candidate failures
      with egress-retryable codes (dead relay / network / timeout / 451)
      move on to the next candidate; REAL Yandex answers (404 / 400 / 429 /
      401) fail fast. On full exhaustion the last verdict is raised, with
      generic network codes re-mapped to yandex_proxy_error (our egress
      relays are down, not Yandex itself); an all-451 exhaustion keeps the
      honest yandex_geo_blocked verdict.
    """
    if _raw_proxy_url():
        return fetch(None, None)

    global _default_egress_index
    last_error: Optional[AdapterError] = None
    for offset in range(len(DEFAULT_EGRESS_PROXIES)):
        idx = (_default_egress_index + offset) % len(DEFAULT_EGRESS_PROXIES)
        candidate = DEFAULT_EGRESS_PROXIES[idx]
        try:
            result = fetch(candidate, EGRESS_CHAIN_TIMEOUT_S)
            _default_egress_index = idx  # sticky: warm starts reuse the good relay
            return result
        except AdapterError as exc:
            if exc.code not in EGRESS_RETRYABLE_CODES:
                raise
            last_error = exc
            sys.stderr.write(
                "[%s] default egress candidate #%d failed: %s\n" % (SERVICE_NAME, idx, exc.code)
            )
    if last_error is not None:
        if last_error.code in ("yandex_unavailable", "yandex_timeout"):
            # All candidates exhausted with network trouble — this is OUR
            # egress chain being down, not Yandex downtime.
            raise AdapterError("yandex_proxy_error", PROXY_UNREACHABLE_MESSAGE, 503)
        raise last_error
    raise AdapterError("yandex_unavailable", "Яндекс.Музыка временно недоступна. Попробуйте позже.", 503)


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
        # Presence only — the URL itself (possible credentials) never leaves.
        "proxy_configured": _raw_proxy_url() != "",
        # The built-in RU/CIS egress chain (public_playlist, zero-config
        # fallback) is active exactly when the operator has NOT configured a
        # private proxy. Honest flag for E2E verification; leaks no hosts.
        "default_egress_active": _raw_proxy_url() == "" and len(DEFAULT_EGRESS_PROXIES) > 0,
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
        # FACT (verified 2026-10-03, music.partners/1293): pager.total counts
        # ALL track slots — including deleted/unavailable ones — while
        # `tracks` carries only the available ones, and the endpoint IGNORES
        # the page param (identical response for ?page=1/2). Extending with a
        # re-fetched page would duplicate every track, so pages only append
        # shorts whose (id, album_id) key is NEW.
        pager = getattr(playlist, "pager", None)
        if pager is not None and pager.total and pager.total > len(shorts):
            seen_keys = {_short_key(s) for s in shorts}
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
                fresh = [t for t in extra_pl.tracks if _short_key(t) not in seen_keys]
                if not fresh:
                    break  # the page returned nothing new — paging is a no-op here
                shorts.extend(fresh)
                seen_keys.update(_short_key(t) for t in fresh)
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


def action_public_playlist(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch a PUBLIC playlist with NO token and NO auth.

    Two mutually exclusive inputs (exactly one must be present):
      - {"user_id": "<login|uid>", "kind": "<int>"}  — classic links
        (tokenless client.users_playlists(kind, user_id=...))
      - {"playlist_uuid": "<uuid>"}                     — new-player links
        (tokenless client.playlist(playlist_uuid) → GET /playlist/{uuid})

    Mirrors action_playlist_tracks (same pagination, same track normalization).
    The TelegramBot User-Agent is applied only for the duration of this action.
    """
    user_id = payload.get("user_id")
    kind = payload.get("kind")
    playlist_uuid = payload.get("playlist_uuid")
    user_id = str(user_id).strip() if user_id is not None else ""
    playlist_uuid = str(playlist_uuid).strip().lower() if playlist_uuid is not None else ""

    by_uuid = bool(playlist_uuid)
    if by_uuid:
        if user_id or kind is not None:
            raise AdapterError("bad_request", "Некорректный запрос: укажите только UUID плейлиста.", 400)
        if not PLAYLIST_UUID_RE.match(playlist_uuid):
            raise AdapterError("bad_request", "Некорректный идентификатор плейлиста.", 400)
    else:
        if not user_id or len(user_id) > 64 or not user_id.replace(".", "").replace("-", "").replace("_", "").isalnum():
            raise AdapterError("bad_request", "Некорректный владелец плейлиста.", 400)
        if kind is None or str(kind).strip() == "" or not str(kind).isdigit() or int(str(kind)) <= 0:
            raise AdapterError("bad_request", "Некорректный идентификатор плейлиста.", 400)

    def _fetch(proxy_url: Optional[str], timeout: Optional[float]) -> Dict[str, Any]:
        client = _client(proxy_url=proxy_url, timeout=timeout)  # tokenless — public access, no OAuth, no cookies
        import yandex_music.utils.request_base as _request_base

        previous_ua = _request_base.USER_AGENT
        try:
            _request_base.USER_AGENT = PUBLIC_USER_AGENT
            if by_uuid:
                playlist = client.playlist(playlist_uuid)
            else:
                playlist = client.users_playlists(int(str(kind)), user_id=user_id)
            if playlist is None:
                raise AdapterError(
                    "yandex_not_found",
                    "Плейлист не найден. Проверьте ссылку — плейлист может быть приватным или удалённым.",
                    404,
                )

            shorts: List[Any] = list(playlist.tracks or [])

            # Same pagination contract as playlist_tracks (owner+kind form only:
            # the /playlist/{uuid} endpoint returns the full snapshot at once).
            # pager.total counts deleted/unavailable slots too and the endpoint
            # ignores ?page= (verified factually) — pages only append NEW keys.
            pager = getattr(playlist, "pager", None)
            if pager is not None and pager.total and pager.total > len(shorts) and not by_uuid:
                seen_keys = {_short_key(s) for s in shorts}
                page = 1
                while len(shorts) < pager.total and page < MAX_PLAYLIST_PAGES:
                    try:
                        extra_pl = client.users_playlists(
                            int(str(kind)), user_id=user_id, params={"page": page, "pagePageSize": PLAYLIST_PAGE_SIZE}
                        )
                    except Exception as exc:
                        logging.warning("public playlist page %s fetch failed: %s", page, _map_yandex_error(exc).code)
                        break
                    if extra_pl is None or not extra_pl.tracks:
                        break
                    fresh = [t for t in extra_pl.tracks if _short_key(t) not in seen_keys]
                    if not fresh:
                        break  # page returned nothing new — paging is a no-op here
                    shorts.extend(fresh)
                    seen_keys.update(_short_key(t) for t in fresh)
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
        finally:
            _request_base.USER_AGENT = previous_ua

    # Zero-config RU/CIS egress chain when YANDEX_PROXY_URL is unset; the
    # operator-configured env var keeps the exact legacy single-proxy path.
    return _run_public_with_default_egress(_fetch)


# ── Action dispatch ──────────────────────────────────────────────────────────

ACTIONS = {
    "probe": lambda payload: action_probe(),
    "device_start": action_device_start,
    "device_poll": action_device_poll,
    "account": action_account,
    "playlists_list": action_playlists_list,
    "playlist_tracks": action_playlist_tracks,
    "public_playlist": action_public_playlist,
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
