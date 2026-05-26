# Task 5 — Turso Primary Database Migration

## Task Description
Make Turso the primary database for Vercel deployment, replacing Prisma + PostgreSQL.

## What Was Done

### Core Infrastructure
1. **Created `src/lib/database.ts`** — Unified database adapter (1730+ lines)
   - Auto-selects Turso (when TURSO_DATABASE_URL set) or Prisma (local dev)
   - 40+ typed helper methods for all major database operations
   - Handles SQLite type conversions transparently

2. **Updated `src/lib/db.ts`** — Added Turso detection and dev logging

3. **Created `src/instrumentation.ts`** — Auto-inits Turso schema on Vercel

### API Route Updates (17 routes migrated to use database adapter)
- auth/login, auth/register, auth/me
- auth/confirm, auth/send-code, auth/verify-code
- auth/telegram-verify, auth/update-username
- user/theme, user/avatar, user/profile
- user/heartbeat, user/favorite-artists, user/now-playing
- sync, maintenance, notifications, friends

### Migration Script
- **Created `scripts/migrate-to-turso.ts`** — Migrates data from Prisma/PostgreSQL to Turso/libSQL
- Supports `--dry-run` for preview
- Handles 22 tables with proper foreign key ordering

### Config Updates
- **Updated `.env.example`** — Enhanced Turso setup instructions
- **Created `vercel.json`** — Turso env vars for Vercel deployment

## Key Design Decisions
- Adapter pattern: `database` object with helper methods, not a Prisma API clone
- Environment detection: `!!process.env.TURSO_DATABASE_URL`
- Gradual migration: unmigrated routes still work with Prisma locally
- No breaking changes

## Remaining Work
- ~40 API routes still use Prisma directly (admin, stories, groups, messages detail, playlists detail, music, telegram, etc.)
- These can be migrated incrementally as needed for Vercel deployment
