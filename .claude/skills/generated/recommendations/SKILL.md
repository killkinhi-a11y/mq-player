---
name: recommendations
description: "Skill for the Recommendations area of mq-player. 24 symbols across 2 files."
---

# Recommendations

24 symbols | 2 files | Cohesion: 70%

## When to Use

- Working with code in `src/`
- Understanding how getFromCache, setCache, getTimeContext work
- Modifying recommendations-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/music/recommendations/route.ts` | getFromCache, setCache, getTimeContext, isSpamProneGenre, getRelatedGenres (+14) |
| `src/app/api/playlists/recommendations/route.ts` | normalizeGenre, getTimeContext, getRelatedGenres, extractMoods, handler |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getFromCache` | Function | `src/app/api/music/recommendations/route.ts` | 30 |
| `setCache` | Function | `src/app/api/music/recommendations/route.ts` | 37 |
| `getTimeContext` | Function | `src/app/api/music/recommendations/route.ts` | 50 |
| `isSpamProneGenre` | Function | `src/app/api/music/recommendations/route.ts` | 168 |
| `getRelatedGenres` | Function | `src/app/api/music/recommendations/route.ts` | 173 |
| `getBridgeGenres` | Function | `src/app/api/music/recommendations/route.ts` | 187 |
| `interleaveByArtist` | Function | `src/app/api/music/recommendations/route.ts` | 572 |
| `mapTrack` | Function | `src/app/api/music/recommendations/route.ts` | 635 |
| `handler` | Function | `src/app/api/music/recommendations/route.ts` | 665 |
| `normalizeGenre` | Function | `src/app/api/music/recommendations/route.ts` | 215 |
| `titleHashtagGenreMismatch` | Function | `src/app/api/music/recommendations/route.ts` | 267 |
| `estimateEnergy` | Function | `src/app/api/music/recommendations/route.ts` | 284 |
| `buildSessionMood` | Function | `src/app/api/music/recommendations/route.ts` | 362 |
| `shouldExcludeTrack` | Function | `src/app/api/music/recommendations/route.ts` | 521 |
| `addTrack` | Function | `src/app/api/music/recommendations/route.ts` | 848 |
| `normalizeGenre` | Function | `src/app/api/playlists/recommendations/route.ts` | 5 |
| `getTimeContext` | Function | `src/app/api/playlists/recommendations/route.ts` | 16 |
| `getRelatedGenres` | Function | `src/app/api/playlists/recommendations/route.ts` | 75 |
| `extractMoods` | Function | `src/app/api/playlists/recommendations/route.ts` | 99 |
| `handler` | Function | `src/app/api/playlists/recommendations/route.ts` | 136 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Handler → GetSecret` | cross_community | 4 |
| `Handler → NormalizeGenre` | cross_community | 3 |
| `Handler → GetSoundCloudClientId` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 1 calls |
| Share | 1 calls |
| Artists | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getFromCache"})` — see callers and callees
2. `gitnexus_query({query: "recommendations"})` — find related execution flows
3. Read key files listed above for implementation details
