---
name: curated
description: "Skill for the Curated area of mq-player. 19 symbols across 1 files."
---

# Curated

19 symbols | 1 files | Cohesion: 96%

## When to Use

- Working with code in `src/`
- Understanding how normalizeGenre, getRelatedGenres, getBridgeGenres work
- Modifying curated-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/playlists/curated/route.ts` | normalizeGenre, getRelatedGenres, getBridgeGenres, isNonMusicContent, passesQualityFilter (+14) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `normalizeGenre` | Function | `src/app/api/playlists/curated/route.ts` | 79 |
| `getRelatedGenres` | Function | `src/app/api/playlists/curated/route.ts` | 86 |
| `getBridgeGenres` | Function | `src/app/api/playlists/curated/route.ts` | 100 |
| `isNonMusicContent` | Function | `src/app/api/playlists/curated/route.ts` | 219 |
| `passesQualityFilter` | Function | `src/app/api/playlists/curated/route.ts` | 236 |
| `enforceArtistDiversity` | Function | `src/app/api/playlists/curated/route.ts` | 328 |
| `interleaveByArtist` | Function | `src/app/api/playlists/curated/route.ts` | 352 |
| `mapSCTrack` | Function | `src/app/api/playlists/curated/route.ts` | 408 |
| `searchAndCollect` | Function | `src/app/api/playlists/curated/route.ts` | 431 |
| `addTrack` | Function | `src/app/api/playlists/curated/route.ts` | 442 |
| `sortTracksByPlayability` | Function | `src/app/api/playlists/curated/route.ts` | 513 |
| `buildForYouPlaylist` | Function | `src/app/api/playlists/curated/route.ts` | 529 |
| `buildYourMixPlaylist` | Function | `src/app/api/playlists/curated/route.ts` | 545 |
| `buildSimilarPlaylist` | Function | `src/app/api/playlists/curated/route.ts` | 587 |
| `buildDiscoveriesPlaylist` | Function | `src/app/api/playlists/curated/route.ts` | 650 |
| `buildGenrePlaylists` | Function | `src/app/api/playlists/curated/route.ts` | 690 |
| `buildPopularPlaylist` | Function | `src/app/api/playlists/curated/route.ts` | 737 |
| `calculatePlaylistCoherence` | Function | `src/app/api/playlists/curated/route.ts` | 794 |
| `handler` | Function | `src/app/api/playlists/curated/route.ts` | 821 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Handler → GetSoundCloudClientId` | cross_community | 5 |
| `Handler → InvalidateClientId` | cross_community | 5 |
| `Handler → IsNonMusicContent` | cross_community | 5 |
| `Handler → NormalizeGenre` | intra_community | 5 |
| `BuildDiscoveriesPlaylist → IsNonMusicContent` | intra_community | 5 |
| `BuildForYouPlaylist → IsNonMusicContent` | intra_community | 5 |
| `BuildYourMixPlaylist → IsNonMusicContent` | intra_community | 5 |
| `BuildPopularPlaylist → IsNonMusicContent` | intra_community | 5 |
| `Handler → GetSecret` | cross_community | 4 |
| `Handler → MapSCTrack` | intra_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Artists | 2 calls |
| [id] | 1 calls |

## How to Explore

1. `gitnexus_context({name: "normalizeGenre"})` — see callers and callees
2. `gitnexus_query({query: "curated"})` — find related execution flows
3. Read key files listed above for implementation details
