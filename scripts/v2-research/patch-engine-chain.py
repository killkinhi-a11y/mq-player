#!/usr/bin/env python3
"""
V2 Spotify integration — surgical edit of useAudioEngine.ts loadTrack chain.

Steps:
1. In the source-dispatch chain (from `if (currentTrack.source === "demo"` to the
   final `}` before `} catch (err) {` of loadTrack), rename bare `currentTrack.`
   / `currentTrack?` references to `trackData.` — EXCEPT store reads
   (`useAppStore.getState().currentTrack`) which use the ?. pattern with a
   different receiver and are preserved automatically.
2. Insert the Spotify official/fallback resolution block right before the chain.
"""
import re

PATH = "/home/z/my-project/src/components/mq/useAudioEngine.ts"
src = open(PATH).read()
lines = src.split("\n")

# ── Locate chain boundaries ────────────────────────────────────────────────
chain_start = None  # 0-based index of `if (currentTrack.source === "demo" ...`
for i, l in enumerate(lines):
    if 'if (currentTrack.source === "demo" && currentTrack.audioUrl) {' in l:
        chain_start = i
        break
assert chain_start is not None, "chain start not found"

chain_end = None  # the `} else {` final block end — find `} catch (err) {` after chain_start
for i in range(chain_start, len(lines)):
    if lines[i].strip() == "} catch (err) {":
        chain_end = i  # chain content is everything before this line inside try
        break
assert chain_end is not None, "chain end not found"

# ── Step 1: rename currentTrack → trackData inside the chain ──────────────
renamed = 0
for i in range(chain_start, chain_end):
    l = lines[i]
    # Store reads are preceded by `getState().` — skip those by checking the char before.
    out = []
    idx = 0
    while True:
        j = l.find("currentTrack", idx)
        if j == -1:
            out.append(l[idx:])
            break
        # receiver check: text immediately before must not be `getState().`
        prefix = l[max(0, j - 12):j]
        if prefix.endswith("getState()."):
            out.append(l[idx:j + len("currentTrack")])
        else:
            out.append(l[idx:j])
            out.append("trackData")
        idx = j + len("currentTrack")
    new_l = "".join(out)
    if new_l != l:
        renamed += 1
        lines[i] = new_l
print(f"renamed lines: {renamed}")

# ── Step 2: build the Spotify block + trackData declaration ───────────────
spotify_block = '''
        // ── V2 SPOTIFY SOURCE — Official Playback first (§16 priority), then
        //    honest alternative resolution (§26). Catalog identity stays
        //    Spotify; only the audio provider switches (badge in the player).
        let trackData: Track = currentTrack;
        if (currentTrack.source === "spotify" && currentTrack.spotifyUri) {
          const forcedFallback = forceSpotifyFallbackRef.current === currentTrack.id;
          if (!forcedFallback && (await spotifyPlaybackAdapter.isOfficialAvailable())) {
            // Official path: the Web Playback SDK owns audio; the element
            // engine must not touch it. Pause any element/WASM audio first.
            audioEl.pause();
            const _inactive = getInactiveAudio();
            if (_inactive) _inactive.pause();
            setPlaybackMode("spotify");
            resetCorsState();
            pbMark("T5-network-start", "spotify-official");
            useAppStore.getState().setSpotifyFallbackNotice(null);
            const played = await spotifyPlaybackAdapter.play(currentTrack.spotifyUri, {
              volumePercent: useAppStore.getState().volume,
            });
            if (cancelled) return;
            if (played) {
              // Duration arrives via player_state_changed (events effect);
              // seed optimistically from the catalog metadata.
              const dur = spotifyPlaybackAdapter.getDurationSec() || currentTrack.duration || 0;
              if (dur) setDuration(dur);
              setProgress(0);
              setIsLoadingTrack(false);
              setPlayError(false);
              retryCountRef.current = 0;
              prevTrackIdForCrossfade.current = currentTrack.id;
              console.log(`[Player] Spotify Official Playback: ${currentTrack.title}`);
              return;
            }
            console.warn("[Player] Spotify official play() failed — resolving alternative source");
          } else if (!forcedFallback) {
            console.log("[Player] Spotify Official unavailable (not connected / Free / unsupported browser) — alternative resolver");
          }

          // ── Alternative resolution (server-scored SoundCloud → Audius) ──
          let alt: {
            found: boolean;
            provider?: string;
            trackId?: string | number;
            scTrackId?: number | null;
            cover?: string;
            duration?: number;
          } | null = null;
          try {
            const altRes = await fetch(
              `/api/spotify/resolve-alternative?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}&duration=${currentTrack.duration || 0}`,
              { signal: AbortSignal.timeout(15000) },
            );
            if (altRes.ok) alt = await altRes.json();
          } catch { /* resolver unreachable — honest failure below */ }
          if (cancelled) return;

          if (alt?.found && (alt.scTrackId || alt.provider === "audius")) {
            const provider = alt.provider === "audius" ? "audius" : "soundcloud";
            trackData = {
              ...currentTrack,
              source: provider,
              scTrackId: alt.scTrackId ?? undefined,
              // Audius stream resolution is id-driven — carry the resolved
              // Audius id on the LOAD shape only (store identity unchanged).
              id: provider === "audius" ? String(alt.trackId) : currentTrack.id,
              cover: currentTrack.cover || alt.cover || "",
              duration: currentTrack.duration || alt.duration || 0,
              playbackProvider: provider,
            } as Track;
            useAppStore.getState().setSpotifyFallbackNotice(
              `Spotify-каталог • аудио: ${provider === "audius" ? "Audius" : "SoundCloud"}`,
            );
            console.log(`[Player] Spotify fallback → ${provider} (track ${currentTrack.title})`);
          } else {
            // No confident alternative (§2: no random substitutions).
            setPlaybackMode("idle");
            setPlayError(true);
            setIsLoadingTrack(false);
            prevTrackIdForCrossfade.current = null;
            try {
              toast({
                title: "Источник недоступен",
                description: `«${currentTrack.title}» — Spotify Official недоступен, альтернатива не найдена`,
              });
            } catch {}
            const _failId = useAppStore.getState().currentTrack?.id;
            setTimeout(() => {
              if (useAppStore.getState().currentTrack?.id === _failId) nextTrackRef.current();
            }, 1800);
            return;
          }
        }

'''

lines.insert(chain_start, spotify_block.rstrip("\n"))
open(PATH, "w").write("\n".join(lines))
print("inserted spotify block at line", chain_start + 1)
