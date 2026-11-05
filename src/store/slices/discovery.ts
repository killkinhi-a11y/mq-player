// Store slice: Home feed, release radar, playlist recommendations, similar tracks.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE_STORE.md.
import type { HomeCuratedPlaylist, HomeRecCategory, StoreSlice } from "@/store/types";
import { type Track, countryNameFromCode, detectUserCountry } from "@/lib/musicApi";
import { extractTasteProfile } from "@/lib/tasteProfile";

// Module-scope in-flight guard for the home feed fetch (Task 2):
// every caller of loadHomeFeed() while a fetch is running awaits the SAME
// promise — remounts, tab-focus and taste changes cannot stack requests.
let homeFeedInFlight: Promise<void> | null = null;

export type DiscoverySliceKeys =
  | "setSimilarTracks"
  | "loadHomeFeed"
  | "setSimilarTracksLoading"
  | "fetchPlaylistRecommendations"
  | "fetchReleaseRadar";

/** Home feed, release radar, playlist recommendations, similar tracks. */
export const createDiscoverySlice: StoreSlice<DiscoverySliceKeys> = (set, get) => ({

      setSimilarTracks: (tracks) => set({ similarTracks: tracks }),

      // ── Home feed cache (Task 2: one fetch per taste change, TTL-guarded) ──
      // In-flight dedupe lives OUTSIDE the store object (module scope) so
      // every caller awaits the same promise instead of stacking requests.
      loadHomeFeed: async (opts) => {
        const { force = false, tasteSig, topGenres = [], topArtists = [] } = opts || {};
        const HOME_FEED_TTL = 5 * 60 * 1000; // 5 min

        const s0 = get();
        if (homeFeedInFlight) return; // an identical request is already running
        if (
          !force &&
          s0.homeFeedTasteSig === tasteSig &&
          Date.now() - s0.homeFeedFetchedAt < HOME_FEED_TTL &&
          (s0.homeRecCategories.length > 0 || s0.homeCuratedPlaylists.length > 0)
        ) {
          return; // fresh cache for the SAME taste — no reload
        }

        const run = (async () => {
          set({ homeFeedLoading: true, homeFeedError: null });
          try {
            const st = get();
            const disliked = st.dislikedTrackIds || [];
            const params = new URLSearchParams();
            const likedScIds = (st.likedTracksData || [])
              .map((t: any) => t.scTrackId)
              .filter((id: any): id is number => !!id)
              .slice(0, 5)
              .join(",");
            if (likedScIds) params.set("likedScIds", likedScIds);
            const historyScIds = (st.history || [])
              .slice(0, 10)
              .map((h: any) => h.track?.scTrackId)
              .filter((id: any): id is number => !!id)
              .join(",");
            if (historyScIds) params.set("historyScIds", historyScIds);
            if (disliked.length > 0) params.set("dislikedIds", disliked.join(","));
            if (topGenres.length > 0) params.set("genres", topGenres.join(","));
            const favArtistNames = (st.favoriteArtists || []).map((a: any) => a.username);
            const allArtists = [...new Set([...favArtistNames, ...topArtists])];
            if (allArtists.length > 0) params.set("artists", allArtists.slice(0, 5).join(","));

            const userCountry = detectUserCountry();

            // Curated recommendations: pass the SAME taste signals the
            // endpoint understands (genres / artists / liked SC ids /
            // disliked genres) so the Home's recommended playlists are
            // actually personalized («Для вас», «Ваш микс», «Похожее»,
            // жанровые подборки) instead of the anonymous two-playlist
            // fallback. Genres/artists = the FULL profile (explicit slider
            // likes ∪ play-history signals) via the shared
            // extractTasteProfile — existing API params, no new engine.
            const tp = extractTasteProfile({
              history: Array.isArray(st.history) ? st.history : [],
              likedTracksData: Array.isArray(st.likedTracksData) ? st.likedTracksData : [],
            });
            const curatedGenreList = [...new Set([...topGenres, ...tp.allGenres])].slice(0, 6);
            const curatedArtistList = [...new Set([...topArtists, ...tp.topHistoryArtists])].slice(0, 5);
            const curatedParams = new URLSearchParams();
            if (disliked.length > 0) curatedParams.set("dislikedIds", disliked.join(","));
            if (curatedGenreList.length > 0) curatedParams.set("genres", curatedGenreList.join(","));
            if (curatedArtistList.length > 0) curatedParams.set("artists", curatedArtistList.join(","));
            if (likedScIds) curatedParams.set("likedScIds", likedScIds);
            const dislikedGenres = [...new Set(
              (st.dislikedTracksData || [])
                .map((t: any) => (t?.genre || "").toLowerCase().trim())
                .filter(Boolean)
            )];
            if (dislikedGenres.length > 0) curatedParams.set("dislikedGenres", dislikedGenres.join(","));

            // 5 parallel requests: recs + trending + apple + spotify + curated
            const [recSettled, trendingSettled, appleSettled, spotifySettled, curatedSettled] =
              await Promise.allSettled([
                fetch(`/api/music/recommendations?${params}`),
                fetch(`/api/music/trending?limit=50`),
                fetch(`/api/music/apple-charts?country=${userCountry}`),
                fetch(`/api/music/spotify-charts?country=${userCountry}`),
                fetch(`/api/playlists/curated?${curatedParams}`),
              ]);
            const recRes = recSettled.status === "fulfilled" ? recSettled.value : null;
            const trendingRes = trendingSettled.status === "fulfilled" ? trendingSettled.value : null;
            const appleRes = appleSettled.status === "fulfilled" ? appleSettled.value : null;
            const spotifyRes = spotifySettled.status === "fulfilled" ? spotifySettled.value : null;
            const curatedRes = curatedSettled.status === "fulfilled" ? curatedSettled.value : null;

            const cats: HomeRecCategory[] = [];

            if (spotifyRes?.ok) {
              try {
                const spotifyData = await spotifyRes.json();
                const spotifyTracks = (spotifyData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
                if (spotifyTracks.length > 0) {
                  cats.push({ id: "spotify_top", title: "Топ Spotify", icon: "Flame", tracks: spotifyTracks });
                }
              } catch {}
            }

            if (appleRes?.ok) {
              try {
                const appleData = await appleRes.json();
                const appleTracks = (appleData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
                if (appleTracks.length > 0) {
                  const cName = countryNameFromCode(appleData.country || userCountry);
                  cats.push({ id: "apple_top", title: `Топ ${cName}`, icon: "Flame", tracks: appleTracks });
                }
              } catch {}
            }

            if (trendingRes?.ok) {
              try {
                const tData = await trendingRes.json();
                const trendingTracks = (tData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
                if (trendingTracks.length > 0) {
                  cats.push({ id: "trending_now", title: "Популярное сейчас", icon: "Flame", tracks: trendingTracks });
                }
              } catch {}
            }

            if (recRes?.ok) {
              try {
                const data = await recRes.json();
                const recCats = (data.categories || []).map((cat: any) => ({
                  id: cat.id || `cat_${Date.now()}_${Math.random()}`,
                  title: cat.title || "Рекомендации",
                  icon: cat.icon || "Sparkles",
                  tracks: (cat.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50),
                })).filter((cat: any) => cat.tracks.length > 0);
                cats.push(...recCats);
              } catch {}
            }

            if (cats.length === 0 && trendingRes?.ok) {
              try {
                const tData = await trendingRes.json();
                const fallback = (tData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
                if (fallback.length > 0) {
                  cats.push({ id: "fallback", title: "Для вас", icon: "Sparkles", tracks: fallback });
                }
              } catch {}
            }

            let curated: HomeCuratedPlaylist[] = [];
            if (curatedRes?.ok) {
              try {
                const curatedData = await curatedRes.json();
                curated = curatedData.playlists || [];
              } catch {}
            }

            const anyResponded = !!(recRes || trendingRes || appleRes || spotifyRes || curatedRes);
            set({
              homeRecCategories: cats,
              homeCuratedPlaylists: curated,
              homeFeedFetchedAt: Date.now(),
              homeFeedTasteSig: tasteSig,
              homeFeedError: cats.length > 0 || curated.length > 0 ? null : anyResponded ? "empty" : "offline",
            });
          } catch (err) {
            const isOffline =
              err instanceof TypeError &&
              (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"));
            set({ homeRecCategories: [], homeFeedError: isOffline ? "offline" : "api" });
          } finally {
            set({ homeFeedLoading: false });
            homeFeedInFlight = null;
          }
        })();

        homeFeedInFlight = run;
        return run;
      },
      setSimilarTracksLoading: (loading) => set({ similarTracksLoading: loading }),

      fetchPlaylistRecommendations: async (likedTags = [], likedArtists = []) => {
        const { userId, likedTracksData, history, dislikedTags, dislikedTracksData } = get();
        set({ recommendedPlaylistsLoading: true });

        // Build taste profile from store if not provided
        let tags = likedTags;
        let artists = likedArtists;
        const genreCount: Record<string, number> = {};
        const artistCount: Record<string, number> = {};
        if (tags.length === 0 && artists.length === 0) {
          const allTracks = [...likedTracksData, ...history.slice(0, 50).map((h) => h.track)];
          for (const t of allTracks) {
            if (t.genre) genreCount[t.genre] = (genreCount[t.genre] || 0) + 2;
            if (t.artist) artistCount[t.artist] = (artistCount[t.artist] || 0) + 1;
          }
          tags = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
          artists = Object.entries(artistCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a);
        }

        // Build disliked genres from disliked tracks
        const dislikedGenresSet = new Set<string>();
        for (const track of (dislikedTracksData || [])) {
          if (track.genre) dislikedGenresSet.add(track.genre.toLowerCase());
        }

        // Detect language preference
        const langCounts: Record<string, number> = { russian: 0, english: 0, latin: 0 };
        function detectLang(text: string): string {
          if (!text) return "other";
          const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
          const latin = (text.match(/[a-zA-Z]/g) || []).length;
          const total = cyrillic + latin;
          if (total === 0) return "other";
          if (cyrillic / total > 0.4) return "russian";
          if (latin / total > 0.6) return "english";
          return "latin";
        }
        for (const t of likedTracksData) {
          const l = detectLang(`${t.title} ${t.artist}`);
          if (l in langCounts) langCounts[l] += 3;
        }
        for (const h of history.slice(0, 30)) {
          const l = detectLang(`${h.track.title} ${h.track.artist}`);
          if (l in langCounts) langCounts[l] += 1;
        }
        const sortedLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
        const totalLang = sortedLang.reduce((s, e) => s + e[1], 0);
        const languagePref = totalLang > 0 && sortedLang[0][1] >= totalLang * 0.4 ? sortedLang[0][0] : "mixed";

        try {
          const sp = new URLSearchParams({ limit: '10' });
          if (tags.length > 0) sp.set('likedTags', tags.join(','));
          if (artists.length > 0) sp.set('likedArtists', artists.join(','));
          if (dislikedTags.length > 0) sp.set('dislikedTags', dislikedTags.join(','));
          // v4: send richer signals
          if (tags.length > 0) sp.set('topGenres', tags.join(','));
          if (dislikedGenresSet.size > 0) sp.set('dislikedGenres', [...dislikedGenresSet].join(','));
          if (languagePref !== 'mixed') sp.set('lang', languagePref);
          const res = await fetch(`/api/playlists/recommendations?${sp}`);
          if (res.ok) {
            const data = await res.json();
            set({ recommendedPlaylists: data.playlists || [], recommendedPlaylistsLoading: false });
          } else {
            set({ recommendedPlaylistsLoading: false });
          }
        } catch {
          set({ recommendedPlaylistsLoading: false });
        }
      },

      // ── Release Radar actions ──
      fetchReleaseRadar: async () => {
        const { likedTracksData } = get();
        set({ releaseRadarLoading: true });
        try {
          // Extract top artists from liked tracks
          const artistCounts: Record<string, number> = {};
          for (const t of likedTracksData) {
            if (t.artist) artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
          }
          const topArtists = Object.entries(artistCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([a]) => a);

          if (topArtists.length === 0) {
            set({ releaseRadarTracks: [], releaseRadarLoading: false });
            return;
          }

          // Search for recent tracks from top artists
          const allTracks: Track[] = [];
          const seen = new Set<string>();

          for (const artist of topArtists.slice(0, 3)) {
            try {
              const res = await fetch(`/api/music/search?q=${encodeURIComponent(artist + " 2025 2026")}&limit=10`);
              if (res.ok) {
                const data = await res.json();
                const tracks: Track[] = data.tracks || [];
                for (const t of tracks) {
                  if (!seen.has(t.id)) {
                    seen.add(t.id);
                    allTracks.push(t);
                  }
                }
              }
            } catch (e) { console.warn("[store]", e); }
          }

          set({ releaseRadarTracks: allTracks.slice(0, 20), releaseRadarLoading: false });
        } catch {
          set({ releaseRadarTracks: [], releaseRadarLoading: false });
        }
      },
});

