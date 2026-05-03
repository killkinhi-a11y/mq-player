---
name: email-test
description: "Skill for the Email-test area of mq-player. 11 symbols across 4 files."
---

# Email-test

11 symbols | 4 files | Cohesion: 84%

## When to Use

- Working with code in `src/`
- Understanding how isEmailConfigured, getEmailStatus, sendVerificationEmail work
- Modifying email-test-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/email.ts` | isEmailConfigured, getEmailStatus, sendEmail, escapeHtml, emailTemplate (+2) |
| `src/app/api/admin/email-test/route.ts` | getHandler, postHandler |
| `src/app/api/auth/send-code/route.ts` | POST |
| `src/app/api/auth/register/route.ts` | POST |

## Entry Points

Start here when exploring this area:

- **`isEmailConfigured`** (Function) — `src/lib/email.ts:22`
- **`getEmailStatus`** (Function) — `src/lib/email.ts:29`
- **`sendVerificationEmail`** (Function) — `src/lib/email.ts:109`
- **`sendPasswordResetEmail`** (Function) — `src/lib/email.ts:132`
- **`POST`** (Function) — `src/app/api/auth/send-code/route.ts:6`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isEmailConfigured` | Function | `src/lib/email.ts` | 22 |
| `getEmailStatus` | Function | `src/lib/email.ts` | 29 |
| `sendVerificationEmail` | Function | `src/lib/email.ts` | 109 |
| `sendPasswordResetEmail` | Function | `src/lib/email.ts` | 132 |
| `POST` | Function | `src/app/api/auth/send-code/route.ts` | 6 |
| `POST` | Function | `src/app/api/auth/register/route.ts` | 7 |
| `sendEmail` | Function | `src/lib/email.ts` | 49 |
| `escapeHtml` | Function | `src/lib/email.ts` | 79 |
| `emailTemplate` | Function | `src/lib/email.ts` | 88 |
| `getHandler` | Function | `src/app/api/admin/email-test/route.ts` | 9 |
| `postHandler` | Function | `src/app/api/admin/email-test/route.ts` | 29 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → EscapeHtml` | intra_community | 4 |
| `POST → EscapeHtml` | intra_community | 4 |
| `PostHandler → GetSecret` | cross_community | 4 |
| `PostHandler → EscapeHtml` | intra_community | 4 |
| `POST → Cleanup` | cross_community | 3 |
| `POST → IsEmailConfigured` | intra_community | 3 |
| `POST → SendEmail` | intra_community | 3 |
| `POST → Cleanup` | cross_community | 3 |
| `POST → IsEmailConfigured` | intra_community | 3 |
| `POST → SendEmail` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Notifications | 4 calls |
| [id] | 2 calls |

## How to Explore

1. `gitnexus_context({name: "isEmailConfigured"})` — see callers and callees
2. `gitnexus_query({query: "email-test"})` — find related execution flows
3. Read key files listed above for implementation details
