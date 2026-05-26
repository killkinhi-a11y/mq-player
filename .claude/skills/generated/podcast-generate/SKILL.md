---
name: podcast-generate
description: "Skill for the Podcast-generate area of mq-player. 15 symbols across 1 files."
---

# Podcast-generate

15 symbols | 1 files | Cohesion: 93%

## When to Use

- Working with code in `skills/`
- Understanding how parseArgs, readText, countNonWsChars work
- Modifying podcast-generate-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `skills/podcast-generate/generate.ts` | parseArgs, readText, countNonWsChars, chooseDurationMinutes, charBudget (+10) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `parseArgs` | Function | `skills/podcast-generate/generate.ts` | 76 |
| `readText` | Function | `skills/podcast-generate/generate.ts` | 99 |
| `countNonWsChars` | Function | `skills/podcast-generate/generate.ts` | 108 |
| `chooseDurationMinutes` | Function | `skills/podcast-generate/generate.ts` | 112 |
| `charBudget` | Function | `skills/podcast-generate/generate.ts` | 117 |
| `buildPrompts` | Function | `skills/podcast-generate/generate.ts` | 124 |
| `callZAI` | Function | `skills/podcast-generate/generate.ts` | 231 |
| `scriptToSegments` | Function | `skills/podcast-generate/generate.ts` | 250 |
| `validateScript` | Function | `skills/podcast-generate/generate.ts` | 292 |
| `makeRetryHint` | Function | `skills/podcast-generate/generate.ts` | 343 |
| `ttsRequest` | Function | `skills/podcast-generate/generate.ts` | 359 |
| `ensureSilenceWav` | Function | `skills/podcast-generate/generate.ts` | 378 |
| `wavParams` | Function | `skills/podcast-generate/generate.ts` | 402 |
| `joinWavsWave` | Function | `skills/podcast-generate/generate.ts` | 410 |
| `main` | Function | `skills/podcast-generate/generate.ts` | 467 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Scripts | 2 calls |

## How to Explore

1. `gitnexus_context({name: "parseArgs"})` — see callers and callees
2. `gitnexus_query({query: "podcast-generate"})` — find related execution flows
3. Read key files listed above for implementation details
