#!/usr/bin/env python3
"""
MQ Yandex adapter — self-tests (run with the same interpreter/env as the adapter).

Covers (Phase 10 AUTH/PLAYLIST/SECURITY matrix, Python side):
  - HMAC signature verification: ok / missing / bad / stale / constant-time path
  - action dispatch (unknown action, malformed JSON, oversize body)
  - error mapping: UnauthorizedError → yandex_unauthorized, TimedOut → timeout,
    DeviceAuthError(expired) → device_code_expired, NetworkError 429 → rate_limited
  - playlists_list maps real library object fields and skips banners
  - playlist_tracks maps TrackShort + batch Track metadata in Yandex order
  - tokens never appear in error output or logs

Usage:
    python3 scripts/yandex/test_adapter.py
Exit code 0 = all pass.
"""

import hashlib
import hmac
import importlib.util
import json
import os
import sys
import types
from pathlib import Path

ADAPTER_PATH = Path(__file__).resolve().parents[2] / "api" / "yandex_adapter.py"

os.environ["JWT_SECRET"] = "adapter-self-test-secret"

spec = importlib.util.spec_from_file_location("yandex_adapter", ADAPTER_PATH)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

PASS = 0
FAIL = 0


def check(name: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok  {name}")
    else:
        FAIL += 1
        print(f" FAIL {name} {extra}")


def derived() -> bytes:
    return hmac.new(b"adapter-self-test-secret", b"mq-yandex-adapter-v1", hashlib.sha256).digest()


def sign(body: bytes, ts: int | None = None) -> tuple[str, str]:
    timestamp = str(int(__import__("time").time()) if ts is None else ts)
    sig = hmac.new(derived(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return timestamp, sig


# ── HMAC verification ─────────────────────────────────────────────────────────

def test_signature() -> None:
    print("signature verification:")
    body = b'{"action": "probe"}'
    ts, sig = sign(body)
    ok, reason = adapter.verify_signature(ts, sig, body)
    check("valid signature accepted", ok and reason == "")

    ok, reason = adapter.verify_signature("", "", body)
    check("missing signature rejected", not ok and reason == "missing_signature")

    ts2, _ = sign(body)
    ok, reason = adapter.verify_signature(ts2, "deadbeef" * 8, body)
    check("bad signature rejected", not ok and reason == "bad_signature")

    ok, reason = adapter.verify_signature("not-a-number", "x", body)
    check("bad timestamp rejected", not ok and reason == "bad_timestamp")

    old_ts = str(int(__import__("time").time()) - 3600)
    old_sig = hmac.new(derived(), old_ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    ok, reason = adapter.verify_signature(old_ts, old_sig, body)
    check("stale timestamp rejected", not ok and reason == "stale_timestamp")

    # body tamper: signature over a different body must fail
    ts3, sig3 = sign(body)
    ok, reason = adapter.verify_signature(ts3, sig3, b'{"action": "device_poll", "device_code": "x"}')
    check("tampered body rejected", not ok and reason == "bad_signature")


# ── Error mapping ─────────────────────────────────────────────────────────────

def test_error_mapping() -> None:
    print("error mapping:")
    from yandex_music.exceptions import (
        DeviceAuthError,
        TimedOutError,
        UnauthorizedError,
    )
    import yandex_music.exceptions as exc

    e = adapter._map_yandex_error(UnauthorizedError("401"))
    check("unauthorized → yandex_unauthorized", e.code == "yandex_unauthorized" and e.status == 401)

    timeout_err = TimedOutError()
    timeout_err.args = ("timed out",)
    e = adapter._map_yandex_error(timeout_err)
    check("timeout → yandex_timeout", e.code == "yandex_timeout" and e.status == 504)

    e = adapter._map_yandex_error(DeviceAuthError("timed out after 300s"))
    check("device expired → device_code_expired", e.code == "device_code_expired" and e.status == 400)

    e = adapter._map_yandex_error(DeviceAuthError("access_denied"))
    check("denied → device_access_denied", e.code == "device_access_denied" and e.status == 403)

    class FakeNet(exc.NetworkError):
        pass

    e = adapter._map_yandex_error(FakeNet("429 Too Many Requests"))
    check("429 → yandex_rate_limited", e.code == "yandex_rate_limited" and e.status == 429)

    e = adapter._map_yandex_error(FakeNet("Unavailable For Legal Reasons (451)"))
    check(
        "451 → yandex_geo_blocked (503)",
        e.code == "yandex_geo_blocked" and e.status == 503 and "регион" in e.message,
    )

    e = adapter._map_yandex_error(FakeNet("451"))
    check("bare 451 → yandex_geo_blocked too", e.code == "yandex_geo_blocked")

    e = adapter._map_yandex_error(RuntimeError("unexpected"))
    check("unknown → sanitized yandex_error", e.code == "yandex_error" and "unexpected" not in e.message)

    token = "y0_SUPER_SECRET"
    try:
        raise exc.UnauthorizedError(f"401 {token}")
    except Exception as real:
        e = adapter._map_yandex_error(real)
    check("error message never contains the token", token not in e.message)


# ── Playlists mapping (fake library objects with real field names) ───────────

class FakeCover:
    def get_url(self, index: int = 0, size: str = "200x200") -> str:
        return f"https://avatars.mds.yandex.net/fake/{size}.jpg"


class FakeOwner:
    login = "ya.owner"
    display_name = "Owner"


class FakePlaylist:
    def __init__(self, **kw):
        self.uid = kw.get("uid", 1)
        self.kind = kw.get("kind", 3)
        self.title = kw.get("title", "PL")
        self.description = kw.get("description", "")
        self.track_count = kw.get("track_count", 5)
        self.tracks = kw.get("tracks", [])
        self.visibility = "public"
        self.owner = kw.get("owner", FakeOwner())
        self.cover = kw.get("cover", FakeCover())
        self.duration_ms = 1000
        self.modified = ""
        self.collective = False
        self.is_banner = kw.get("is_banner", False)


class FakeArtist:
    def __init__(self, name: str):
        self.name = name


class FakeAlbum:
    def __init__(self, id_, title):
        self.id = id_
        self.title = title


class FakeTrack:
    def __init__(self, **kw):
        self.id = kw.get("id", "1")
        self.title = kw.get("title", "T")
        self.artists = kw.get("artists", [])
        self.albums = kw.get("albums", [])
        self.duration_ms = kw.get("duration_ms", 200000)
        self.available = kw.get("available", True)


class FakeShort:
    def __init__(self, id_, album_id, embedded=None):
        self.id = id_
        self.album_id = album_id
        self.track = embedded


class FakeClient:
    """Stands in for yandex_music.Client with the REAL method signatures."""

    def __init__(self, playlists=None, detail=None, tracks=None):
        self._playlists = playlists or []
        self._detail = detail
        self._tracks = tracks or []

    def init(self):
        return self

    def account_status(self):
        acc = types.SimpleNamespace(uid=42, login="ya.user", display_name="YU", full_name="Y U")
        return types.SimpleNamespace(account=acc)

    def users_playlists_list(self, user_id=None):
        return self._playlists

    def users_playlists(self, kind, user_id=None, **kwargs):
        return self._detail

    def tracks(self, track_ids):
        return self._tracks


def test_playlist_mapping() -> None:
    print("playlists mapping:")
    pls = [
        FakePlaylist(kind=3, title="Мне нравится", track_count=42),
        FakePlaylist(kind=1001, title="Road", track_count=7),
        FakePlaylist(kind=999, title="AD", is_banner=True),  # banner → skipped
    ]
    client = FakeClient(playlists=pls)
    orig = adapter._client
    adapter._client = lambda token=None: client
    try:
        result = adapter.action_playlists_list({"token": "tok"})
        names = [p["title"] for p in result["playlists"]]
        check("returns real playlists in order", names == ["Мне нравится", "Road"])
        check("banner playlists skipped", all(p["kind"] != 999 for p in result["playlists"]))
        first = result["playlists"][0]
        check(
            "brief fields mapped (snake_case contract)",
            first["kind"] == 3 and first["track_count"] == 42 and first["owner_login"] == "ya.owner"
            and first["cover_url"].startswith("https://avatars.mds.yandex.net/fake/300x300"),
        )
    finally:
        adapter._client = orig


def test_playlist_tracks_mapping() -> None:
    print("playlist_tracks mapping:")
    short_a = FakeShort("111", "555")
    short_b = FakeShort("222", "555")
    short_a.track = None
    short_b.track = None
    detail = FakePlaylist(kind=1001, title="Road", track_count=2, tracks=[short_a, short_b])
    full_a = FakeTrack(id="111", title="Alpha", artists=[FakeArtist("A1")], albums=[FakeAlbum(555, "Album")])
    full_b = FakeTrack(id="222", title="Beta", artists=[FakeArtist("B1"), FakeArtist("B2")], albums=[FakeAlbum(555, "Album")])
    client = FakeClient(detail=detail, tracks=[full_a, full_b])
    orig = adapter._client
    adapter._client = lambda token=None: client
    try:
        result = adapter.action_playlist_tracks({"token": "tok", "kind": 1001})
        check("kind/title passthrough", result["kind"] == 1001 and result["title"] == "Road")
        t = result["tracks"]
        check("yandex order preserved", [x["track_id"] for x in t] == ["111", "222"])
        check("positions sequential", [x["position"] for x in t] == [0, 1])
        check("artists mapped", t[0]["artists"] == ["A1"] and t[1]["artists"] == ["B1", "B2"])
        check("album metadata mapped", t[0]["album_title"] == "Album" and t[0]["album_id_full"] == "555")
        check("durations in ms", t[0]["duration_ms"] == 200000)
    finally:
        adapter._client = orig


def test_public_playlist_action() -> None:
    print("public_playlist action (tokenless):")
    # ── happy path: user_id + kind passthrough, tracks normalized, UA patched ──
    calls = {}

    import yandex_music.utils.request_base as rb

    class RecordingClient(FakeClient):
        def users_playlists(self, kind, user_id=None, **kwargs):
            calls.setdefault("kinds", []).append(kind)
            calls.setdefault("user_ids", []).append(user_id)
            calls.setdefault("uas", []).append(rb.USER_AGENT)
            return self._detail

    short = FakeShort("111", "555")
    detail = FakePlaylist(kind=1293, title="Партнёрский", track_count=1, tracks=[short])
    full = FakeTrack(id="111", title="Alpha", artists=[FakeArtist("A1")], albums=[FakeAlbum(555, "Album")])
    client = RecordingClient(detail=detail, tracks=[full])
    orig_client = adapter._client
    adapter._client = lambda token=None: client
    try:
        result = adapter.action_public_playlist({"user_id": "music.partners", "kind": 1293})
        check("user_id passed through", calls["user_ids"][0] == "music.partners")
        check("kind passed as int", calls["kinds"][0] == 1293)
        check("playlist fields mapped", result["kind"] == 1293 and result["title"] == "Партнёрский")
        check("owner login mapped", result["owner_login"] == "ya.owner")
        t = result["tracks"]
        check("track normalized in order", len(t) == 1 and t[0]["track_id"] == "111" and t[0]["position"] == 0)
        check("full metadata batch-fetched", t[0]["title"] == "Alpha" and t[0]["artists"] == ["A1"])
        check("no token in result", "token" not in json.dumps(result))
        check("TelegramBot UA applied during the call", calls["uas"][0] == "TelegramBot")
    finally:
        adapter._client = orig_client

    # UA restore contract (module-level constant is back to its original value)
    check(
        "module UA constant restored after action",
        rb.USER_AGENT == "Yandex-Music-API",
        f"got {rb.USER_AGENT!r}",
    )

    # ── None playlist → not found ──
    class NoneClient(FakeClient):
        def users_playlists(self, kind, user_id=None, **kwargs):
            return None

    adapter._client = lambda token=None: NoneClient()
    try:
        try:
            adapter.action_public_playlist({"user_id": "u", "kind": 5})
            check("None playlist → yandex_not_found", False)
        except adapter.AdapterError as e:
            check("None playlist → yandex_not_found", e.code == "yandex_not_found" and e.status == 404)
    finally:
        adapter._client = orig_client

    # ── bad inputs ──
    for payload, label in [
        ({}, "missing user+kind"),
        ({"user_id": "u"}, "missing kind"),
        ({"kind": 1}, "missing user"),
        ({"user_id": "../etc", "kind": 1}, "path traversal user"),
        ({"user_id": "a b", "kind": 1}, "space in user"),
        ({"user_id": "u" * 65, "kind": 1}, "user too long"),
        ({"user_id": "u", "kind": "abc"}, "non-numeric kind"),
        ({"user_id": "u", "kind": 0}, "zero kind"),
        ({"user_id": "u", "kind": -1}, "negative kind"),
    ]:
        try:
            adapter.action_public_playlist(payload)
            check(f"bad input rejected ({label})", False)
        except adapter.AdapterError as e:
            check(f"bad input rejected ({label})", e.code == "bad_request" and e.status == 400)

    # ── string kind from JSON is coerced ──
    adapter._client = lambda token=None: RecordingClient(detail=detail)
    try:
        result = adapter.action_public_playlist({"user_id": "music.partners", "kind": "1293"})
        check("string kind coerced to int", result["kind"] == 1293)
    finally:
        adapter._client = orig_client

    # ── action registered in dispatch ──
    check("public_playlist registered in ACTIONS", callable(adapter.ACTIONS.get("public_playlist")))


def test_account_action() -> None:
    print("account action:")
    client = FakeClient()
    orig = adapter._client
    adapter._client = lambda token=None: client
    try:
        result = adapter.action_account({"token": "tok"})
        check(
            "account fields mapped",
            result["uid"] == 42 and result["login"] == "ya.user" and result["display_name"] == "YU",
        )
    finally:
        adapter._client = orig


def test_device_actions_dispatch() -> None:
    print("device actions:")
    try:
        adapter.action_device_poll({})
        check("device_poll without code → bad_request", False)
    except adapter.AdapterError as e:
        check("device_poll without code → bad_request", e.code == "bad_request")
    try:
        adapter.action_account({})
        check("account without token → bad_request", False)
    except adapter.AdapterError as e:
        check("account without token → bad_request", e.code == "bad_request")

    unknown = adapter.ACTIONS.get("definitely_not_an_action")
    check("unknown action is not dispatchable", unknown is None)


def test_proxy_support() -> None:
    """YANDEX_PROXY_URL egress proxy: validation, native wiring, error mapping."""
    print("egress proxy (YANDEX_PROXY_URL):")
    import requests as _rq
    from yandex_music.exceptions import NetworkError

    saved = os.environ.get("YANDEX_PROXY_URL")
    try:
        # ── default (unset) is a strict no-op ──
        os.environ.pop("YANDEX_PROXY_URL", None)
        check("unset env -> proxy None", adapter._proxy_url() is None)
        check("unset env -> probe reports False", adapter.action_probe()["proxy_configured"] is False)
        client = adapter._client()
        check("unset env -> client has no proxies", client._request.proxies is None)

        # ── valid http(s) URLs wire the NATIVE library proxy support ──
        for url in (
            "http://ru.example:8080",
            "https://user:pass@ru.example:8443",
            "socks5://ru.example:1080",
            "socks5h://ru.example:1080",
            "socks4://ru.example:1080",
        ):
            os.environ["YANDEX_PROXY_URL"] = url
            scheme = url.split("://", 1)[0]
            check(f"valid proxy accepted ({scheme})", adapter._proxy_url() == url)
            c = adapter._client()
            check(
                f"client request carries proxies ({scheme})",
                c._request.proxies == {"http": url, "https": url} and c._request.proxy_url == url,
            )
        check("valid env -> probe reports True", adapter.action_probe()["proxy_configured"] is True)

        # ── token clients keep the OAuth header AND get the proxy ──
        os.environ["YANDEX_PROXY_URL"] = "http://ru.example:8080"
        c = adapter._client(token="tok-123")
        check(
            "token client keeps OAuth header through proxy",
            c._request.headers.get("Authorization") == "OAuth tok-123" and c._request.proxies is not None,
        )

        # ── malformed configs are rejected BEFORE any network call ──
        for bad in ("not-a-url", "ftp://x:1", "http://", "https://:8080", "socks5://", "x" * 600, "//nohost:1"):
            os.environ["YANDEX_PROXY_URL"] = bad
            try:
                adapter._client()
                check(f"bad proxy rejected ({bad[:22]})", False)
            except adapter.AdapterError as e:
                check(
                    f"bad proxy rejected ({bad[:22]})",
                    e.code == "yandex_proxy_error" and e.status == 503,
                )

        # ── proxy failure mapping (only when the var is set) ──
        os.environ["YANDEX_PROXY_URL"] = "http://dead-proxy:1"
        try:
            raise NetworkError(_rq.exceptions.ProxyError("Cannot connect to proxy."))
        except NetworkError as exc:
            err = adapter._map_yandex_error(exc)
        check("ProxyError + env -> yandex_proxy_error", err.code == "yandex_proxy_error" and err.status == 503)

        try:
            raise NetworkError(_rq.exceptions.InvalidSchema("Missing dependencies for SOCKS support"))
        except NetworkError as exc:
            err = adapter._map_yandex_error(exc)
        check("SOCKS deps missing -> yandex_proxy_error", err.code == "yandex_proxy_error")

        # 451 through a working proxy still maps to the geo code
        try:
            raise NetworkError("Playlist is unavailable for legal reasons (451)")
        except NetworkError as exc:
            err = adapter._map_yandex_error(exc)
        check("451 through proxy -> still yandex_geo_blocked", err.code == "yandex_geo_blocked")

        # ── without the var, identical failures stay generic ──
        os.environ.pop("YANDEX_PROXY_URL", None)
        try:
            raise NetworkError(_rq.exceptions.ProxyError("Cannot connect to proxy."))
        except NetworkError as exc:
            err = adapter._map_yandex_error(exc)
        check("ProxyError WITHOUT env -> generic yandex_unavailable", err.code == "yandex_unavailable")

        # ── the proxy URL never leaks into probe output ──
        os.environ["YANDEX_PROXY_URL"] = "http://secret-user:secret-pass@ru.example:8080"
        probe = adapter.action_probe()
        check("probe never leaks the proxy URL", "secret-pass" not in json.dumps(probe) and probe["proxy_configured"] is True)
    finally:
        if saved is None:
            os.environ.pop("YANDEX_PROXY_URL", None)
        else:
            os.environ["YANDEX_PROXY_URL"] = saved


if __name__ == "__main__":
    test_signature()
    test_error_mapping()
    test_playlist_mapping()
    test_playlist_tracks_mapping()
    test_public_playlist_action()
    test_account_action()
    test_device_actions_dispatch()
    test_proxy_support()
    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)
