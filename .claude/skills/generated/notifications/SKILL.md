---
name: notifications
description: "Skill for the Notifications area of mq-player. 27 symbols across 14 files."
---

# Notifications

27 symbols | 14 files | Cohesion: 76%

## When to Use

- Working with code in `src/`
- Understanding how rateLimit, getClientIp, withRateLimit work
- Modifying notifications-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/rate-limit.ts` | cleanup, rateLimit, getClientIp, withRateLimit, setHeaders |
| `src/app/api/notifications/route.ts` | ensureTable, GET, POST, PUT, DELETE |
| `src/app/api/support/route.ts` | findBotResponse, POST, GET |
| `src/app/api/messages/route.ts` | GET, POST |
| `src/app/api/listen-session/route.ts` | GET, POST |
| `src/app/api/friends/route.ts` | GET, POST |
| `src/app/api/maintenance/route.ts` | POST |
| `src/app/api/messages/typing/route.ts` | POST |
| `src/app/api/messages/transcribe/route.ts` | POST |
| `src/app/api/messages/sse/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`rateLimit`** (Function) — `src/lib/rate-limit.ts:41`
- **`getClientIp`** (Function) — `src/lib/rate-limit.ts:92`
- **`withRateLimit`** (Function) — `src/lib/rate-limit.ts:135`
- **`setHeaders`** (Function) — `src/lib/rate-limit.ts:147`
- **`POST`** (Function) — `src/app/api/support/route.ts:60`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `rateLimit` | Function | `src/lib/rate-limit.ts` | 41 |
| `getClientIp` | Function | `src/lib/rate-limit.ts` | 92 |
| `withRateLimit` | Function | `src/lib/rate-limit.ts` | 135 |
| `setHeaders` | Function | `src/lib/rate-limit.ts` | 147 |
| `POST` | Function | `src/app/api/support/route.ts` | 60 |
| `GET` | Function | `src/app/api/support/route.ts` | 151 |
| `GET` | Function | `src/app/api/notifications/route.ts` | 32 |
| `POST` | Function | `src/app/api/notifications/route.ts` | 61 |
| `PUT` | Function | `src/app/api/notifications/route.ts` | 105 |
| `DELETE` | Function | `src/app/api/notifications/route.ts` | 141 |
| `GET` | Function | `src/app/api/messages/route.ts` | 5 |
| `POST` | Function | `src/app/api/messages/route.ts` | 64 |
| `POST` | Function | `src/app/api/maintenance/route.ts` | 41 |
| `GET` | Function | `src/app/api/listen-session/route.ts` | 7 |
| `POST` | Function | `src/app/api/listen-session/route.ts` | 80 |
| `GET` | Function | `src/app/api/friends/route.ts` | 6 |
| `POST` | Function | `src/app/api/friends/route.ts` | 62 |
| `POST` | Function | `src/app/api/messages/typing/route.ts` | 26 |
| `POST` | Function | `src/app/api/messages/transcribe/route.ts` | 7 |
| `GET` | Function | `src/app/api/messages/sse/route.ts` | 17 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → GetSecret` | cross_community | 4 |
| `PUT → GetSecret` | cross_community | 4 |
| `GET → GetSecret` | cross_community | 4 |
| `POST → GetSecret` | cross_community | 4 |
| `DELETE → GetSecret` | cross_community | 4 |
| `POST → GetSecret` | cross_community | 4 |
| `POST → GetSecret` | cross_community | 4 |
| `POST → GetSecret` | cross_community | 4 |
| `POST → GetSecret` | cross_community | 4 |
| `POST → GetSecret` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 25 calls |
| Scripts | 1 calls |
| Verify-code | 1 calls |

## How to Explore

1. `gitnexus_context({name: "rateLimit"})` — see callers and callees
2. `gitnexus_query({query: "notifications"})` — find related execution flows
3. Read key files listed above for implementation details
