---
name: id
description: "Skill for the [id] area of mq-player. 69 symbols across 45 files."
---

# [id]

69 symbols | 45 files | Cohesion: 64%

## When to Use

- Working with code in `src/`
- Understanding how getSession, requireAuth, GET work
- Modifying [id]-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/track/[id]/page.tsx` | formatDuration, ShareTrackPage, fetchTrack, loadAudio |
| `src/app/api/group-chats/[id]/route.ts` | getHandler, deleteHandler, patchHandler |
| `src/app/api/admin/cron/route.ts` | verifyAdmin, getHandler, postHandler |
| `src/app/api/admin/billing/route.ts` | verifyAdmin, getHandler, postHandler |
| `src/lib/get-session.ts` | getSession, requireAuth |
| `src/app/api/stories/route.ts` | getHandler, postHandler |
| `src/app/api/sync/route.ts` | getHandler, postHandler |
| `src/app/api/group-chats/route.ts` | getHandler, postHandler |
| `src/app/api/user/now-playing/route.ts` | getHandler, putHandler |
| `src/app/api/user/theme/route.ts` | getHandler, postHandler |

## Entry Points

Start here when exploring this area:

- **`getSession`** (Function) — `src/lib/get-session.ts:12`
- **`requireAuth`** (Function) — `src/lib/get-session.ts:28`
- **`GET`** (Function) — `src/app/api/db-sync/route.ts:491`
- **`GET`** (Function) — `src/app/api/support/sse/route.ts:10`
- **`POST`** (Function) — `src/app/api/push/unsubscribe/route.ts:6`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getSession` | Function | `src/lib/get-session.ts` | 12 |
| `requireAuth` | Function | `src/lib/get-session.ts` | 28 |
| `GET` | Function | `src/app/api/db-sync/route.ts` | 491 |
| `GET` | Function | `src/app/api/support/sse/route.ts` | 10 |
| `POST` | Function | `src/app/api/push/unsubscribe/route.ts` | 6 |
| `POST` | Function | `src/app/api/push/subscribe/route.ts` | 6 |
| `POST` | Function | `src/app/api/push/send/route.ts` | 6 |
| `GET` | Function | `src/app/api/messages/unread-count/route.ts` | 11 |
| `GET` | Function | `src/app/api/auth/me/route.ts` | 4 |
| `verifyTelegramWebhook` | Function | `src/lib/telegram.ts` | 78 |
| `onError` | Function | `src/components/mq/PlayerBar.tsx` | 263 |
| `load` | Function | `src/components/mq/MessengerView.tsx` | 1047 |
| `ShareTrackPage` | Function | `src/app/track/[id]/page.tsx` | 25 |
| `fetchTrack` | Function | `src/app/track/[id]/page.tsx` | 46 |
| `loadAudio` | Function | `src/app/track/[id]/page.tsx` | 90 |
| `getHandler` | Function | `src/app/api/stories/route.ts` | 7 |
| `postHandler` | Function | `src/app/api/stories/route.ts` | 63 |
| `getHandler` | Function | `src/app/api/sync/route.ts` | 6 |
| `postHandler` | Function | `src/app/api/sync/route.ts` | 36 |
| `deleteHandler` | Function | `src/app/api/playlists/route.ts` | 216 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `PostHandler → GetSecret` | cross_community | 5 |
| `PatchHandler → GetSecret` | cross_community | 5 |
| `PostHandler → GetSecret` | cross_community | 5 |
| `PostHandler → GetSecret` | cross_community | 5 |
| `PostHandler → GetSecret` | cross_community | 5 |
| `Handler → GetSecret` | cross_community | 4 |
| `POST → GetSecret` | cross_community | 4 |
| `PUT → GetSecret` | cross_community | 4 |
| `GET → GetSecret` | cross_community | 4 |
| `POST → GetSecret` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Verify-code | 1 calls |
| Hooks | 1 calls |
| Mq | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getSession"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
