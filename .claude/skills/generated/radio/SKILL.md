---
name: radio
description: "Skill for the Radio area of mq-player. 15 symbols across 1 files."
---

# Radio

15 symbols | 1 files | Cohesion: 77%

## When to Use

- Working with code in `src/`
- Understanding how normalizeGenre, detectLanguage, estimateEnergy work
- Modifying radio-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/music/radio/route.ts` | normalizeGenre, detectLanguage, estimateEnergy, hasNoiseKeywords, titleHashtagGenreMismatch (+10) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `normalizeGenre` | Function | `src/app/api/music/radio/route.ts` | 47 |
| `detectLanguage` | Function | `src/app/api/music/radio/route.ts` | 60 |
| `estimateEnergy` | Function | `src/app/api/music/radio/route.ts` | 72 |
| `hasNoiseKeywords` | Function | `src/app/api/music/radio/route.ts` | 133 |
| `titleHashtagGenreMismatch` | Function | `src/app/api/music/radio/route.ts` | 147 |
| `scoreCandidate` | Function | `src/app/api/music/radio/route.ts` | 246 |
| `shouldExclude` | Function | `src/app/api/music/radio/route.ts` | 340 |
| `addCandidate` | Function | `src/app/api/music/radio/route.ts` | 665 |
| `getFromCache` | Function | `src/app/api/music/radio/route.ts` | 28 |
| `setCache` | Function | `src/app/api/music/radio/route.ts` | 35 |
| `fetchSCTrackRelated` | Function | `src/app/api/music/radio/route.ts` | 166 |
| `selectWithEnergyDiversity` | Function | `src/app/api/music/radio/route.ts` | 381 |
| `pick` | Function | `src/app/api/music/radio/route.ts` | 392 |
| `interleaveRadioTracks` | Function | `src/app/api/music/radio/route.ts` | 448 |
| `handler` | Function | `src/app/api/music/radio/route.ts` | 495 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Handler → GetSoundCloudClientId` | cross_community | 3 |
| `Handler → InvalidateClientId` | cross_community | 3 |
| `Handler → IsNonMusicContent` | cross_community | 3 |
| `Handler → NormalizeGenre` | cross_community | 3 |
| `ScoreCandidate → NormalizeGenre` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Share | 1 calls |
| Artists | 1 calls |

## How to Explore

1. `gitnexus_context({name: "normalizeGenre"})` — see callers and callees
2. `gitnexus_query({query: "radio"})` — find related execution flows
3. Read key files listed above for implementation details
