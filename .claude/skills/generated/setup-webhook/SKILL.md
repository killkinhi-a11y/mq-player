---
name: setup-webhook
description: "Skill for the Setup-webhook area of mq-player. 10 symbols across 4 files."
---

# Setup-webhook

10 symbols | 4 files | Cohesion: 96%

## When to Use

- Working with code in `src/`
- Understanding how isTelegramConfigured, getBotName, setWebhook work
- Modifying setup-webhook-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/telegram.ts` | isTelegramConfigured, getBotName, setWebhook, getBotInfo, getWebhookInfo |
| `src/app/api/telegram/setup-webhook/route.ts` | POST, GET |
| `src/app/api/telegram/diagnose/route.ts` | GET, POST |
| `src/app/api/auth/telegram-bot-name/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`isTelegramConfigured`** (Function) — `src/lib/telegram.ts:22`
- **`getBotName`** (Function) — `src/lib/telegram.ts:29`
- **`setWebhook`** (Function) — `src/lib/telegram.ts:247`
- **`getBotInfo`** (Function) — `src/lib/telegram.ts:270`
- **`getWebhookInfo`** (Function) — `src/lib/telegram.ts:285`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isTelegramConfigured` | Function | `src/lib/telegram.ts` | 22 |
| `getBotName` | Function | `src/lib/telegram.ts` | 29 |
| `setWebhook` | Function | `src/lib/telegram.ts` | 247 |
| `getBotInfo` | Function | `src/lib/telegram.ts` | 270 |
| `getWebhookInfo` | Function | `src/lib/telegram.ts` | 285 |
| `POST` | Function | `src/app/api/telegram/setup-webhook/route.ts` | 10 |
| `GET` | Function | `src/app/api/telegram/setup-webhook/route.ts` | 58 |
| `GET` | Function | `src/app/api/telegram/diagnose/route.ts` | 10 |
| `POST` | Function | `src/app/api/telegram/diagnose/route.ts` | 68 |
| `GET` | Function | `src/app/api/auth/telegram-bot-name/route.ts` | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Webhook | 1 calls |

## How to Explore

1. `gitnexus_context({name: "isTelegramConfigured"})` — see callers and callees
2. `gitnexus_query({query: "setup-webhook"})` — find related execution flows
3. Read key files listed above for implementation details
