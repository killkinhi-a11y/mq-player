/**
 * @vitest-environment node
 *
 * Yandex Music PUBLIC playlist URL parser tests (src/lib/yandex/public-url.ts):
 *   - valid shapes (ru/com, www, schemeless, trailing slash, query/hash)
 *   - invalid URLs / unsupported hosts / SSRF attempt vectors
 *   - extraction of ownerLogin + kind and canonical URL normalization
 */

import { describe, it, expect } from "vitest";
import {
  parseYandexPlaylistUrl,
  isYandexPlaylistUrl,
  YANDEX_MUSIC_HOSTS,
} from "@/lib/yandex/public-url";

describe("parseYandexPlaylistUrl — valid URLs", () => {
  it("parses the primary task URL (music.partners/1293)", () => {
    expect(parseYandexPlaylistUrl("https://music.yandex.ru/users/music.partners/playlists/1293")).toEqual({
      ownerLogin: "music.partners",
      kind: 1293,
      playlistUuid: null,
      normalizedUrl: "https://music.yandex.ru/users/music.partners/playlists/1293",
    });
  });

  it("parses new-player UUID links (/playlist/{uuid})", () => {
    expect(
      parseYandexPlaylistUrl("https://music.yandex.ru/playlist/1ccd74db-792b-4756-60f7-96b22f024a4e")
    ).toEqual({
      ownerLogin: null,
      kind: null,
      playlistUuid: "1ccd74db-792b-4756-60f7-96b22f024a4e",
      normalizedUrl: "https://music.yandex.ru/playlist/1ccd74db-792b-4756-60f7-96b22f024a4e",
    });
  });

  it("parses the alt UUID form (/playlists/{uuid}) and lowercases the uuid", () => {
    expect(
      parseYandexPlaylistUrl("https://music.yandex.com/playlists/1CCD74DB-792B-4756-60F7-96B22F024A4E")
    ).toMatchObject({ playlistUuid: "1ccd74db-792b-4756-60f7-96b22f024a4e" });
  });

  it("accepts UUID links with query/hash and trailing slash", () => {
    expect(
      parseYandexPlaylistUrl("https://music.yandex.ru/playlist/1ccd74db-792b-4756-60f7-96b22f024a4e/?utm=1#x")
    ).toMatchObject({ playlistUuid: "1ccd74db-792b-4756-60f7-96b22f024a4e" });
  });

  it("parses the secondary task URL (rsljst/1100)", () => {
    expect(parseYandexPlaylistUrl("https://music.yandex.ru/users/rsljst/playlists/1100")).toMatchObject({
      ownerLogin: "rsljst",
      kind: 1100,
    });
  });

  it("accepts www + trailing slash + query + hash", () => {
    const r = parseYandexPlaylistUrl(
      "https://www.music.yandex.ru/users/some.user/playlists/42/?utm_source=share#tracks"
    );
    expect(r).toMatchObject({ ownerLogin: "some.user", kind: 42 });
    expect(r!.normalizedUrl).toBe("https://music.yandex.ru/users/some.user/playlists/42");
  });

  it("accepts the .com international host", () => {
    expect(parseYandexPlaylistUrl("https://music.yandex.com/users/artist/playlists/7")).toMatchObject({
      ownerLogin: "artist",
      kind: 7,
    });
  });

  it("accepts http and scheme-less pastes", () => {
    expect(parseYandexPlaylistUrl("http://music.yandex.ru/users/x/playlists/1")).not.toBeNull();
    expect(parseYandexPlaylistUrl("music.yandex.ru/users/x/playlists/1")).not.toBeNull();
  });

  it("accepts uppercase host (case-insensitive)", () => {
    expect(parseYandexPlaylistUrl("https://MUSIC.YANDEX.RU/users/x/playlists/1")).not.toBeNull();
  });

  it("accepts numeric owner ids (uid form)", () => {
    expect(parseYandexPlaylistUrl("https://music.yandex.ru/users/12345678/playlists/3")).toMatchObject({
      ownerLogin: "12345678",
      kind: 3,
    });
  });
});

describe("parseYandexPlaylistUrl — invalid URLs", () => {
  const bad: Array<[string, string]> = [
    ["", "empty"],
    ["   ", "whitespace"],
    ["not a url at all", "plain text"],
    ["https://vk.com/music/playlist/123_456", "wrong service"],
    ["https://open.spotify.com/playlist/abc", "spotify"],
    ["https://yandex.ru/music/users/x/playlists/1", "music under yandex.ru root (not allow-listed)"],
    ["https://music.yandex.ru.evil.com/users/x/playlists/1", "host suffix attack"],
    ["https://evil.com/music.yandex.ru/users/x/playlists/1", "path prefix attack"],
    ["https://music.yandex.ru:8443/users/x/playlists/1", "port not allowed"],
    ["https://user:pass@music.yandex.ru/users/x/playlists/1", "credentials not allowed"],
    ["https://music.yandex.ru/users/x/playlists/", "missing kind"],
    ["https://music.yandex.ru/users/x/playlists/abc", "non-numeric kind"],
    ["https://music.yandex.ru/users/x/playlists/0", "zero kind"],
    ["https://music.yandex.ru/users/x/playlists/-1", "negative kind"],
    ["https://music.yandex.ru/users/x/playlists/99999999999", "kind too large"],
    ["https://music.yandex.ru/playlist/1293", "short /playlist/ form (numeric id, not a uuid)"],
    ["https://music.yandex.ru/playlist/1ccd74db-792b-4756-60f7-96b22f024a4e/extra", "uuid link with extra path segment"],
    ["https://music.yandex.ru/playlist/not-a-uuid", "/playlist/ with non-uuid payload"],
    ["https://music.yandex.ru/playlist/", "/playlist/ with empty uuid"],
    ["https://music.yandex.ru/users/x", "missing playlists segment"],
    ["https://music.yandex.ru/users/x/albums/1", "wrong segment name"],
    ["https://music.yandex.ru/users/../playlists/1", "traversal login"],
    ["https://music.yandex.ru/users/x y/playlists/1", "space in login"],
    ["https://music.yandex.ru/users/x/playlists/1/extra", "extra path segment"],
    ["ftp://music.yandex.ru/users/x/playlists/1", "non-http scheme"],
    ["javascript:alert(1)", "javascript scheme"],
    ["file:///etc/passwd", "file scheme"],
    ["https://music.yandex.ru/users/" + "a".repeat(65) + "/playlists/1", "login too long"],
    ["https://music.yandex.ru/users/" + "a".repeat(400) + "/playlists/1", "login huge"],
  ];

  for (const [url, label] of bad) {
    it(`rejects ${label} (${url.slice(0, 60)})`, () => {
      expect(parseYandexPlaylistUrl(url)).toBeNull();
    });
  }

  it("rejects URLs over 512 chars", () => {
    const url = "https://music.yandex.ru/users/x/playlists/1?" + "q".repeat(600);
    expect(parseYandexPlaylistUrl(url)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(parseYandexPlaylistUrl(null as unknown as string)).toBeNull();
    expect(parseYandexPlaylistUrl(undefined as unknown as string)).toBeNull();
    expect(parseYandexPlaylistUrl(123 as unknown as string)).toBeNull();
  });
});

describe("isYandexPlaylistUrl", () => {
  it("true only for valid Yandex playlist URLs", () => {
    expect(isYandexPlaylistUrl("https://music.yandex.ru/users/a/playlists/1")).toBe(true);
    expect(isYandexPlaylistUrl("https://vk.com/playlist")).toBe(false);
    expect(isYandexPlaylistUrl("https://music.yandex.ru/album/1")).toBe(false);
  });

  it("true for new-player UUID links", () => {
    expect(isYandexPlaylistUrl("https://music.yandex.ru/playlist/1ccd74db-792b-4756-60f7-96b22f024a4e")).toBe(true);
    expect(isYandexPlaylistUrl("https://music.yandex.ru/playlist/1293")).toBe(false);
  });
});

describe("host allow-list", () => {
  it("contains exactly the official Yandex Music hosts", () => {
    expect([...YANDEX_MUSIC_HOSTS].sort()).toEqual(
      ["music.yandex.com", "music.yandex.ru", "www.music.yandex.com", "www.music.yandex.ru"].sort()
    );
  });
});
