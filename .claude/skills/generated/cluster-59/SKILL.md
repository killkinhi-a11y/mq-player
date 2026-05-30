---
name: cluster-59
description: "Skill for the Cluster_59 area of mq-player. 17 symbols across 3 files."
---

# Cluster_59

17 symbols | 3 files | Cohesion: 90%

## When to Use

- Working with code in `skills/`
- Understanding how addToWatchlist, removeFromWatchlist, listWatchlist work
- Modifying cluster_59-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `skills/stock-analysis-skill/src/watchlist.ts` | loadWatchlist, saveWatchlist, fetchCurrentPrice, detectMarket, addToWatchlist (+5) |
| `skills/stock-analysis-skill/src/index.ts` | runRumorScan, runWatchlistAdd, runWatchlistRemove, runWatchlistList, runWatchlistCheck (+1) |
| `skills/stock-analysis-skill/src/rumorScanner.ts` | formatRumorMarkdown |

## Entry Points

Start here when exploring this area:

- **`addToWatchlist`** (Function) — `skills/stock-analysis-skill/src/watchlist.ts:57`
- **`removeFromWatchlist`** (Function) — `skills/stock-analysis-skill/src/watchlist.ts:121`
- **`listWatchlist`** (Function) — `skills/stock-analysis-skill/src/watchlist.ts:138`
- **`checkAlerts`** (Function) — `skills/stock-analysis-skill/src/watchlist.ts:173`
- **`formatWatchlistMarkdown`** (Function) — `skills/stock-analysis-skill/src/watchlist.ts:236`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `addToWatchlist` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 57 |
| `removeFromWatchlist` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 121 |
| `listWatchlist` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 138 |
| `checkAlerts` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 173 |
| `formatWatchlistMarkdown` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 236 |
| `formatAlertsMarkdown` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 281 |
| `formatRumorMarkdown` | Function | `skills/stock-analysis-skill/src/rumorScanner.ts` | 148 |
| `runRumorScan` | Function | `skills/stock-analysis-skill/src/index.ts` | 205 |
| `runWatchlistAdd` | Function | `skills/stock-analysis-skill/src/index.ts` | 215 |
| `runWatchlistRemove` | Function | `skills/stock-analysis-skill/src/index.ts` | 223 |
| `runWatchlistList` | Function | `skills/stock-analysis-skill/src/index.ts` | 228 |
| `runWatchlistCheck` | Function | `skills/stock-analysis-skill/src/index.ts` | 233 |
| `loadWatchlist` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 13 |
| `saveWatchlist` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 21 |
| `fetchCurrentPrice` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 31 |
| `detectMarket` | Function | `skills/stock-analysis-skill/src/watchlist.ts` | 49 |
| `cli` | Function | `skills/stock-analysis-skill/src/index.ts` | 259 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Cli → DetectMarket` | cross_community | 5 |
| `Cli → Create` | cross_community | 4 |
| `Cli → FetchRumorNews` | cross_community | 4 |
| `Cli → AggregateTopTickers` | cross_community | 4 |
| `Cli → LoadWatchlist` | intra_community | 4 |
| `Cli → SaveWatchlist` | intra_community | 4 |
| `Cli → DetectMarket` | intra_community | 4 |
| `AddToWatchlist → Create` | cross_community | 3 |
| `Cli → ParseInput` | cross_community | 3 |
| `Cli → FormatDividendMarkdown` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Scripts | 1 calls |
| Cluster_60 | 1 calls |
| Cluster_61 | 1 calls |
| Cluster_62 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "addToWatchlist"})` — see callers and callees
2. `gitnexus_query({query: "cluster_59"})` — find related execution flows
3. Read key files listed above for implementation details
