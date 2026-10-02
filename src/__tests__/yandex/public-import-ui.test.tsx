/**
 * @vitest-environment jsdom
 *
 * PublicPlaylistImport UI tests: the in-modal public Yandex flow.
 * Fetch is mocked at the HTTP boundary; no component internals are stubbed.
 *
 *   - loading state → playlist card → matching progress → preview
 *   - import button creates the playlist IN ORDER with _src metadata
 *   - success toast + «Импорт успешен!»
 *   - error states: fetch failure / not-found / match failure
 *   - ambiguous tracks are never auto-imported
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

if (typeof globalThis.Response === "undefined") {
  globalThis.Response = class {
    status: number;
    _body: string;
    constructor(body: string, init?: { status?: number }) {
      this._body = body;
      this.status = init?.status ?? 200;
    }
    ok = true;
    async json() {
      return JSON.parse(this._body);
    }
    async text() {
      return this._body;
    }
  } as unknown as typeof Response;
}

const storeMod = await import("@/store/useAppStore");
const useAppStore = storeMod.useAppStore;

const mod = await import("@/components/mq/yandex/PublicPlaylistImport");
const PublicPlaylistImport = mod.default;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(props: { url: string; onFinished?: () => void }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <PublicPlaylistImport
        url={props.url}
        onCancel={() => undefined}
        onFinished={props.onFinished ?? (() => undefined)}
      />
    );
  });
}

async function flush(microtasks = 6) {
  for (let i = 0; i < microtasks; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const URL_IN = "https://music.yandex.ru/users/music.partners/playlists/1293";

const PREVIEW = {
  playlist: { title: "Партнёрский плейлист", ownerLogin: "music.partners", coverUrl: "", description: "", kind: 1293, uid: 1 },
  trackCount: 2,
  totalTrackCount: 2,
  tracks: [
    { position: 0, trackId: "a", albumId: null, title: "Song One", artists: ["Artist A"], albumTitle: "", albumIdFull: null, durationMs: 200000, available: true },
    { position: 1, trackId: "b", albumId: null, title: "Song Two", artists: ["Artist B"], albumTitle: "", albumIdFull: null, durationMs: 180000, available: true },
  ],
  sourceUrl: URL_IN,
};

const MATCHED = {
  matches: [
    { position: 0, sourceTrackId: "a", sourceAlbumId: null, yandexTitle: "Song One", yandexArtists: ["Artist A"], yandexDurationSec: 200, status: "matched", mqTrack: { id: "sc1", title: "Song One", artist: "Artist A", album: "", duration: 200, cover: "", genre: "", audioUrl: "u", previewUrl: "", source: "soundcloud", scTrackId: 1 } },
    { position: 1, sourceTrackId: "b", sourceAlbumId: null, yandexTitle: "Song Two", yandexArtists: ["Artist B"], yandexDurationSec: 180, status: "ambiguous", candidates: [{ id: "x" }, { id: "y" }] },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  useAppStore.setState({ playlists: [] });
});

describe("PublicPlaylistImport — happy path", () => {
  it("shows loading → playlist card → preview → imports in order with _src metadata", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/yandex/public-playlist/match")) {
        return jsonResponse(200, MATCHED);
      }
      return jsonResponse(200, PREVIEW);
    });

    mount({ url: URL_IN });

    // Stage 1: loading text appears first
    expect(document.body.textContent).toContain("Загружаем плейлист…");

    await flush(10);

    // Stage 2/3: playlist card + preview counts (1 matched, 1 ambiguous)
    const text = document.body.textContent || "";
    expect(text).toContain("Партнёрский плейлист");
    expect(text).toContain("2 треков");
    expect(text).toContain("Неоднозначные");

    // Import button shows the matched count only
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Импортировать 1")
    );
    expect(btn).toBeTruthy();

    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush(4);

    // Playlist created: order preserved + _src metadata + description with source URL
    const pls = useAppStore.getState().playlists;
    expect(pls).toHaveLength(1);
    expect(pls[0].name).toBe("Партнёрский плейлист");
    expect(pls[0].description).toContain("music.partners");
    expect(pls[0].description).toContain(URL_IN);
    expect(pls[0].tracks).toHaveLength(1); // ambiguous NOT auto-imported
    expect(pls[0].tracks[0]._src).toBe("yandex_music");
    expect(pls[0].tracks[0]._srcTrackId).toBe("a");
    expect(pls[0].tracks[0]._srcPlaylistKind).toBe(1293);

    // Success state
    expect(document.body.textContent).toContain("Импорт успешен!");
  });

  it("dedupes playlist names on re-import ((Яндекс) suffix)", async () => {
    useAppStore.setState({
      playlists: [
        { id: "existing", name: "Партнёрский плейлист", description: "", cover: "", tracks: [], createdAt: 1 },
      ],
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/yandex/public-playlist/match")) {
        return jsonResponse(200, MATCHED);
      }
      return jsonResponse(200, PREVIEW);
    });
    mount({ url: URL_IN });
    await flush(10);
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Импортировать 1")
    );
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush(4);
    const pls = useAppStore.getState().playlists;
    expect(pls).toHaveLength(2);
    expect(pls[1].name).toContain("Яндекс");
  });
});

describe("PublicPlaylistImport — errors", () => {
  it("shows the server error message on not-found (private playlist)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { error: "yandex_not_found", message: "Плейлист недоступен: не найден или скрыт настройками приватности." })
    );
    mount({ url: URL_IN });
    await flush(4);
    expect(document.body.textContent).toContain("приватности");
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "Назад")).toBe(true);
  });

  it("shows the geo-blocked message with region explanation", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, { error: "yandex_geo_blocked", message: "Яндекс.Музыка ограничивает доступ к плейлистам по региону." })
    );
    mount({ url: URL_IN });
    await flush(4);
    expect(document.body.textContent).toContain("регион");
  });

  it("shows a network failure message when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    mount({ url: URL_IN });
    await flush(4);
    expect(document.body.textContent).toContain("Сервер недоступен");
  });

  it("surfaces a match-stage failure and stops", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/yandex/public-playlist/match")) {
        return jsonResponse(500, { error: "internal_error", message: "Не удалось подобрать треки." });
      }
      return jsonResponse(200, PREVIEW);
    });
    mount({ url: URL_IN });
    await flush(10);
    expect(document.body.textContent).toContain("Не удалось подобрать треки");
    expect(useAppStore.getState().playlists).toHaveLength(0);
  });

  it("empty playlist → clear message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "yandex_empty_playlist", message: "В этом плейлисте нет треков." }));
    mount({ url: URL_IN });
    await flush(4);
    expect(document.body.textContent).toContain("нет треков");
  });
});
