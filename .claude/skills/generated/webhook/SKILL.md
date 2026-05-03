---
name: webhook
description: "Skill for the Webhook area of mq-player. 25 symbols across 3 files."
---

# Webhook

25 symbols | 3 files | Cohesion: 96%

## When to Use

- Working with code in `src/`
- Understanding how sendTelegramMessage, answerCallbackQuery, editMessageText work
- Modifying webhook-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/telegram-bot.ts` | setSiteOrigin, getSiteOrigin, getChatState, setChatState, clearChatState (+16) |
| `src/lib/telegram.ts` | sendTelegramMessage, answerCallbackQuery, editMessageText |
| `src/app/api/telegram/webhook/route.ts` | POST |

## Entry Points

Start here when exploring this area:

- **`sendTelegramMessage`** (Function) — `src/lib/telegram.ts:36`
- **`answerCallbackQuery`** (Function) — `src/lib/telegram.ts:147`
- **`editMessageText`** (Function) — `src/lib/telegram.ts:173`
- **`setSiteOrigin`** (Function) — `src/lib/telegram-bot.ts:30`
- **`handleTelegramMessage`** (Function) — `src/lib/telegram-bot.ts:218`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `sendTelegramMessage` | Function | `src/lib/telegram.ts` | 36 |
| `answerCallbackQuery` | Function | `src/lib/telegram.ts` | 147 |
| `editMessageText` | Function | `src/lib/telegram.ts` | 173 |
| `setSiteOrigin` | Function | `src/lib/telegram-bot.ts` | 30 |
| `handleTelegramMessage` | Function | `src/lib/telegram-bot.ts` | 218 |
| `handleCallbackQuery` | Function | `src/lib/telegram-bot.ts` | 345 |
| `POST` | Function | `src/app/api/telegram/webhook/route.ts` | 9 |
| `getSiteOrigin` | Function | `src/lib/telegram-bot.ts` | 37 |
| `getChatState` | Function | `src/lib/telegram-bot.ts` | 72 |
| `setChatState` | Function | `src/lib/telegram-bot.ts` | 92 |
| `clearChatState` | Function | `src/lib/telegram-bot.ts` | 114 |
| `findUserByChatId` | Function | `src/lib/telegram-bot.ts` | 122 |
| `getUserPlaylists` | Function | `src/lib/telegram-bot.ts` | 135 |
| `trackCountFromJson` | Function | `src/lib/telegram-bot.ts` | 148 |
| `buildPlaylistKeyboard` | Function | `src/lib/telegram-bot.ts` | 156 |
| `buildSearchResultsKeyboard` | Function | `src/lib/telegram-bot.ts` | 167 |
| `handleAuthCode` | Function | `src/lib/telegram-bot.ts` | 499 |
| `handleAudioMessage` | Function | `src/lib/telegram-bot.ts` | 528 |
| `handleImportWithTitle` | Function | `src/lib/telegram-bot.ts` | 569 |
| `handleImportToPlaylist` | Function | `src/lib/telegram-bot.ts` | 589 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → SendTelegramMessage` | intra_community | 4 |
| `POST → AnswerCallbackQuery` | intra_community | 3 |
| `POST → ClearChatState` | intra_community | 3 |
| `POST → EditMessageText` | intra_community | 3 |
| `POST → FindUserByChatId` | intra_community | 3 |
| `POST → SetChatState` | intra_community | 3 |
| `HandleAudioMessage → TrackCountFromJson` | intra_community | 3 |
| `HandleImportWithTitle → TrackCountFromJson` | intra_community | 3 |
| `HandleImportToPlaylist → Dispatch` | cross_community | 3 |
| `HandleSearch → GetSoundCloudClientId` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 2 calls |
| Artists | 1 calls |

## How to Explore

1. `gitnexus_context({name: "sendTelegramMessage"})` — see callers and callees
2. `gitnexus_query({query: "webhook"})` — find related execution flows
3. Read key files listed above for implementation details
