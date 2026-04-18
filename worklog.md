# Worklog

## Task: Fix messenger duplicate messages, add password reset & chat pinning

### Task 1: Fix duplicate messages in messenger

**Files modified:**
- `src/app/api/messages/route.ts`
- `src/store/useAppStore.ts`

**Problem:** Client creates optimistic messages with `crypto.randomUUID()` but server ignored the client's `id` and let Prisma auto-generate `cuid()`. When 5-second polling fetched the same message, it had a different ID → no dedup → appeared twice.

**Fix 1a (API route):**
- Extract `id` from request body in POST handler
- Pass `id: id || undefined` to `db.message.create()` so Prisma uses client ID when provided

**Fix 1b (Store):**
- Enhanced `loadMessages` to also dedup by content+sender+receiver signature as a safety net
- Added `existingSignatures` Set alongside `existingIds` Set

### Task 2: Add "Сменить пароль" button in SettingsView

**File modified:** `src/components/mq/SettingsView.tsx`

**Changes:**
- Added `KeyRound` to lucide-react imports
- Added `Button` import from `@/components/ui/button`
- Added state: `showPasswordReset`, `loading`, `error`
- Added "Сменить пароль" button between profile and admin panel buttons
- Added password reset confirmation dialog that calls `/api/auth/send-code`, logs out, and navigates to auth view

### Task 3: Add chat pinning in MessengerView

**File modified:** `src/components/mq/MessengerView.tsx`

**Changes:**
- Added `Pin` to lucide-react imports
- Added `pinnedChatIds` state with localStorage persistence
- Added `togglePinChat` callback
- Added `sortedContacts` useMemo that sorts pinned chats first
- Replaced `filteredContacts.map` with `sortedContacts.map`
- Added pin indicator icon on pinned contacts (absolute positioned on avatar)
- Added `onContextMenu` handler on contact buttons to toggle pin via right-click

### Commit & Push
- Committed as `e572287` with message: `fix: messenger duplicate messages, add password reset & chat pinning`
- Pushed to `origin/main` successfully
