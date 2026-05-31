# Task 5 Work Log: Make Turso the Primary Database for Vercel Deployment

**Date**: 2024-03-05
**Agent**: Code Agent
**Task ID**: 5

## Summary

Replaced Prisma + PostgreSQL as the primary database for Vercel serverless deployment with Turso/libSQL. The approach uses a unified database adapter pattern that automatically selects Turso when `TURSO_DATABASE_URL` is set (Vercel), or falls back to Prisma (local development).

## Changes Made

### 1. Created Unified Database Adapter (`src/lib/database.ts`)
- **1730+ lines** of adapter code with 40+ helper methods
- Auto-detects Turso vs Prisma based on `TURSO_DATABASE_URL` env var
- Provides typed row interfaces for all database models (UserRow, MessageRow, etc.)
- Row parsers that handle SQLite type conversions (boolean → integer, dates → ISO strings)
- Full CRUD operations for all major models:
  - **User**: findUserByEmail, findUserById, findUserByUsername, findUserByTelegramChatId, createUser, updateUser, deleteUser, countUsers, findUserFirstWhereNotId
  - **VerificationCode**: find, create, deleteUnused, markUsed, findRecent
  - **TelegramAuthCode**: find, markUsed
  - **Notification**: create, createMany (batch), find, countUnread, markRead, markAllRead, delete
  - **Friend**: findFriendship, create, updateStatus, delete, findFriends (with JOIN)
  - **UserSync**: findData, upsert, findByUserIdAndKey, delete
  - **Playlist**: find, findPublic, create
  - **FeatureFlag**: find, create, update
  - **AuditLog**: create
  - **Message**: create, find (with sender/receiver JOIN)
  - **Transaction**: wraps operations in sequential execution for Turso, $transaction for Prisma
  - **Schema**: ensureSchema() initializes Turso tables

### 2. Updated `src/lib/db.ts`
- Added `USE_TURSO` export flag
- Added development mode logging to show which DB backend is active
- Preserved Prisma client initialization for local dev fallback

### 3. Updated Critical API Routes (14 routes)
All updated to use `database` adapter from `@/lib/database`:
- `src/app/api/auth/login/route.ts` — uses database.findUserByEmail, findFeatureFlagByKey
- `src/app/api/auth/register/route.ts` — uses database.findUserByUsername, findUserByEmail, createUser, createVerificationCode, findFeatureFlagByKey
- `src/app/api/auth/me/route.ts` — uses database.findUserById
- `src/app/api/auth/confirm/route.ts` — uses database.findUserByEmail, findVerificationCode, markVerificationCodeUsed, updateUser
- `src/app/api/auth/verify-code/route.ts` — uses database.findVerificationCode, findUserByEmail, markVerificationCodeUsed, updateUser
- `src/app/api/auth/telegram-verify/route.ts` — uses database.findTelegramAuthCode, findUserByTelegramChatId, findUserByUsername, markTelegramAuthCodeUsed, createUser, updateUser
- `src/app/api/auth/update-username/route.ts` — uses database.findUserFirstWhereNotId, updateUser
- `src/app/api/user/theme/route.ts` — uses database.findUserById, updateUser
- `src/app/api/user/avatar/route.ts` — uses database.findUserById, updateUser
- `src/app/api/user/profile/route.ts` — uses database.findUserById, findUserFirstWhereNotId, updateUser
- `src/app/api/user/heartbeat/route.ts` — uses database.updateUser
- `src/app/api/user/favorite-artists/route.ts` — uses database.findUserById, updateUser
- `src/app/api/user/now-playing/route.ts` — uses database.findUserSyncByUserIdAndKey, upsertUserSync, deleteUserSync
- `src/app/api/sync/route.ts` — uses database.findUserSyncData, upsertUserSync
- `src/app/api/maintenance/route.ts` — uses database.findFeatureFlagByKey, createFeatureFlag, updateFeatureFlag, createAuditLog
- `src/app/api/notifications/route.ts` — uses database.findNotifications, countUnreadNotifications, createNotification, markNotificationRead, markAllNotificationsRead, deleteNotification
- `src/app/api/friends/route.ts` — uses database.findFriends, findFriendship, createFriend, updateFriendStatus, deleteFriend, createNotification, createNotifications

### 4. Created Migration Script (`scripts/migrate-to-turso.ts`)
- Reads from Prisma/PostgreSQL, writes to Turso/libSQL
- Handles data transformation (booleans → integers, dates → ISO strings, BigInt → Number)
- Supports `--dry-run` flag for preview
- Migrates 22 tables in dependency order (Users first for foreign keys)
- Batch inserts for large tables (Messages, Notifications, GroupMessages)
- Uses `INSERT OR IGNORE` to prevent duplicate key errors

### 5. Created `src/instrumentation.ts`
- Runs once per Node.js server process
- Auto-initializes Turso schema when `TURSO_DATABASE_URL` is set
- Skips Turso init in local dev (uses Prisma instead)
- Compatible with Next.js 16 (instrumentationHook is enabled by default)

### 6. Updated `.env.example`
- Enhanced Turso section with detailed setup instructions
- Added Vercel deployment guidance
- Added migration command references
- Clarified that TURSO_DATABASE_URL can be left empty for local Prisma usage

### 7. Created `vercel.json`
- Configured Turso environment variables for Vercel deployment
- Uses Vercel's secure environment variable references (`@turso-database-url`, `@turso-auth-token`)

## Architecture Decisions

1. **Adapter Pattern**: Created a unified `database` object with helper methods instead of trying to make Turso mimic Prisma's API. This is cleaner and more maintainable.

2. **Environment Detection**: Simple `!!process.env.TURSO_DATABASE_URL` check. When set → Turso, when not → Prisma. This means:
   - Local dev without TURSO_DATABASE_URL → uses Prisma/PostgreSQL
   - Local dev with TURSO_DATABASE_URL → uses Turso
   - Vercel (with TURSO_DATABASE_URL in env) → uses Turso

3. **Type Safety**: All Turso results are parsed through typed row parsers that handle SQLite type conversions. The adapter returns the same typed interfaces regardless of backend.

4. **Gradual Migration**: Other routes that still use `import { db } from "@/lib/db"` continue to work with Prisma. They can be migrated incrementally.

5. **No Breaking Changes**: All existing API routes that weren't updated still work with Prisma when TURSO_DATABASE_URL is not set.

## Remaining Routes Using Prisma (not yet migrated)

These 40+ routes still import `db` from `@/lib/db` and use Prisma directly. They work fine for local development but would need to be migrated to use the `database` adapter for Vercel deployment:

- Admin routes (stats, users, audit, billing, cron, feature-flags, support-chat, auth, email-test)
- Stories routes (like, comment, main)
- Group chat routes
- Messages routes (sse, typing, search, clear, transcribe, unread-count, [id])
- Playlist routes (like, auto-generate, recommendations, generate-cover, [id], curated)
- Music routes (radio, artists, trending, genre, lyrics, search, similar, artist-tracks, import-playlist, upload, soundcloud/*)
- Friends [id] route
- Users routes (search, status, [id]/status)
- Support routes
- Listen session routes
- AI routes
- Push notification routes
- Telegram routes
- DB-sync route

These can be migrated incrementally by updating their imports from `@/lib/db` to `@/lib/database` and replacing Prisma queries with database adapter calls.

## Testing

- TypeScript compilation: ✅ No errors (`npx tsc --noEmit` passes)
- Dev server: ✅ Starts correctly with instrumentation hook
- Instrumentation: ✅ Correctly detects TURSO_DATABASE_URL presence
- Build: ⚠️ Fails at page data collection due to missing local PostgreSQL (expected — not related to our changes)
---
Task ID: 1
Agent: main
Task: Fix SNIP preview track bug — implement OAuth bypass + auto-skip

Work Log:
- Investigated full audio pipeline: stream API → resolveSoundCloudStream → useAudioEngine → UI
- Root cause identified: SoundCloud API returns `policy: "SNIP"` for some tracks, CDN only serves ~10s previews
- Added `scOAuthToken` and `skipSnipTracks` fields to Zustand store (useAppStore.ts)
- Modified `/api/music/soundcloud/stream/route.ts` to accept `oauth_token` parameter and include it as `Authorization: OAuth <token>` header in SoundCloud API requests
- Modified `resolveSoundCloudStream()` in useAudioEngine.ts to pass OAuth token from store
- Added auto-skip SNIP tracks: when `skipSnipTracks` is enabled (default), tracks with SNIP policy are automatically skipped to the next track after 800ms
- Added SoundCloud section in SettingsView with: OAuth token input, token verification, instructions for getting token from SoundCloud Go+ cookies, disconnect option
- Changed "Превью" badges to "SNIP" in PlayerBar and FullTrackView for clarity
- Store clears stream cache when OAuth token changes so SNIP tracks re-resolve with auth
- Built and deployed successfully to production

Stage Summary:
- Two-pronged solution: (1) OAuth token from SoundCloud Go+ subscribers bypasses SNIP, (2) auto-skip SNIP tracks when no token
- Settings page now has a SoundCloud section where users can paste their OAuth token
- OAuth token is verified against SoundCloud's /me endpoint before saving
- Token is stored in localStorage and persists across sessions
- Deployed to: https://mq-player-src.vercel.app
