---
name: similar
description: "Skill for the Similar area of mq-player. 10 symbols across 1 files."
---

# Similar

10 symbols | 1 files | Cohesion: 97%

## When to Use

- Working with code in `src/`
- Understanding how getFromCache, setCache, getRelatedGenres work
- Modifying similar-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/music/similar/route.ts` | getFromCache, setCache, getRelatedGenres, normalizeGenre, hasNoiseKeywords (+5) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getFromCache` | Function | `src/app/api/music/similar/route.ts` | 21 |
| `setCache` | Function | `src/app/api/music/similar/route.ts` | 28 |
| `getRelatedGenres` | Function | `src/app/api/music/similar/route.ts` | 70 |
| `normalizeGenre` | Function | `src/app/api/music/similar/route.ts` | 81 |
| `hasNoiseKeywords` | Function | `src/app/api/music/similar/route.ts` | 95 |
| `extractMoods` | Function | `src/app/api/music/similar/route.ts` | 146 |
| `extractKeywords` | Function | `src/app/api/music/similar/route.ts` | 165 |
| `calculateSimilarity` | Function | `src/app/api/music/similar/route.ts` | 207 |
| `handler` | Function | `src/app/api/music/similar/route.ts` | 273 |
| `processCandidate` | Function | `src/app/api/music/similar/route.ts` | 378 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ProcessCandidate → NormalizeGenre` | intra_community | 3 |
| `ProcessCandidate → HasNoiseKeywords` | intra_community | 3 |
| `ProcessCandidate → GetRelatedGenres` | intra_community | 3 |
| `ProcessCandidate → ExtractKeywords` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Share | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getFromCache"})` — see callers and callees
2. `gitnexus_query({query: "similar"})` — find related execution flows
3. Read key files listed above for implementation details
