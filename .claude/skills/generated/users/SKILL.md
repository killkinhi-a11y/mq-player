---
name: users
description: "Skill for the Users area of mq-player. 10 symbols across 1 files."
---

# Users

10 symbols | 1 files | Cohesion: 67%

## When to Use

- Working with code in `src/`
- Understanding how AdminUsersPage, deleteUser, handleBlock work
- Modifying users-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/admin/users/page.tsx` | AdminUsersPage, deleteUser, handleBlock, handleRoleChange, handleDelete (+5) |

## Entry Points

Start here when exploring this area:

- **`AdminUsersPage`** (Function) — `src/app/admin/users/page.tsx:43`
- **`deleteUser`** (Function) — `src/app/admin/users/page.tsx:110`
- **`handleBlock`** (Function) — `src/app/admin/users/page.tsx:133`
- **`handleRoleChange`** (Function) — `src/app/admin/users/page.tsx:143`
- **`handleDelete`** (Function) — `src/app/admin/users/page.tsx:155`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AdminUsersPage` | Function | `src/app/admin/users/page.tsx` | 43 |
| `deleteUser` | Function | `src/app/admin/users/page.tsx` | 110 |
| `handleBlock` | Function | `src/app/admin/users/page.tsx` | 133 |
| `handleRoleChange` | Function | `src/app/admin/users/page.tsx` | 143 |
| `handleDelete` | Function | `src/app/admin/users/page.tsx` | 155 |
| `formatDate` | Function | `src/app/admin/users/page.tsx` | 166 |
| `performAction` | Function | `src/app/admin/users/page.tsx` | 88 |
| `handleConfirmEmail` | Function | `src/app/admin/users/page.tsx` | 128 |
| `handleUnblock` | Function | `src/app/admin/users/page.tsx` | 139 |
| `handlePasswordReset` | Function | `src/app/admin/users/page.tsx` | 149 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AdminUsersPage → PerformAction` | cross_community | 3 |

## How to Explore

1. `gitnexus_context({name: "AdminUsersPage"})` — see callers and callees
2. `gitnexus_query({query: "users"})` — find related execution flows
3. Read key files listed above for implementation details
