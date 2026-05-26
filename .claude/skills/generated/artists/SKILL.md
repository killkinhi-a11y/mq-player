---
name: artists
description: "Skill for the Artists area of mq-player. 12 symbols across 5 files."
---

# Artists

12 symbols | 5 files | Cohesion: 67%

## When to Use

- Working with code in `src/`
- Understanding how searchSCTracks work
- Modifying artists-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/music/artists/route.ts` | getFromCache, setCache, extractArtistsFromTracks, handler |
| `src/app/api/music/search/route.ts` | getFromCache, setCache, handler |
| `src/lib/soundcloud.ts` | isNonMusicContent, searchSCTracks |
| `src/app/api/music/import-playlist/route.ts` | handler, detectPlatform |
| `src/app/api/music/genre/route.ts` | handler |

## Entry Points

Start here when exploring this area:

- **`searchSCTracks`** (Function) — `src/lib/soundcloud.ts:181`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `searchSCTracks` | Function | `src/lib/soundcloud.ts` | 181 |
| `isNonMusicContent` | Function | `src/lib/soundcloud.ts` | 65 |
| `getFromCache` | Function | `src/app/api/music/search/route.ts` | 11 |
| `setCache` | Function | `src/app/api/music/search/route.ts` | 18 |
| `handler` | Function | `src/app/api/music/search/route.ts` | 22 |
| `handler` | Function | `src/app/api/music/import-playlist/route.ts` | 5 |
| `detectPlatform` | Function | `src/app/api/music/import-playlist/route.ts` | 147 |
| `handler` | Function | `src/app/api/music/genre/route.ts` | 12 |
| `getFromCache` | Function | `src/app/api/music/artists/route.ts` | 16 |
| `setCache` | Function | `src/app/api/music/artists/route.ts` | 23 |
| `extractArtistsFromTracks` | Function | `src/app/api/music/artists/route.ts` | 37 |
| `handler` | Function | `src/app/api/music/artists/route.ts` | 89 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Handler → GetSoundCloudClientId` | cross_community | 5 |
| `Handler → InvalidateClientId` | cross_community | 5 |
| `Handler → IsNonMusicContent` | cross_community | 5 |
| `Handler → GetSoundCloudClientId` | cross_community | 5 |
| `Handler → InvalidateClientId` | cross_community | 5 |
| `Handler → IsNonMusicContent` | cross_community | 5 |
| `Handler → GetSoundCloudClientId` | cross_community | 4 |
| `Handler → InvalidateClientId` | cross_community | 4 |
| `Handler → IsNonMusicContent` | intra_community | 4 |
| `Handler → GetSecret` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Share | 3 calls |
| [id] | 1 calls |
| Import-playlist | 1 calls |

## How to Explore

1. `gitnexus_context({name: "searchSCTracks"})` — see callers and callees
2. `gitnexus_query({query: "artists"})` — find related execution flows
3. Read key files listed above for implementation details
