import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

// Safe migration: creates missing tables and columns without dropping existing ones.
// Uses PostgreSQL's CREATE TABLE IF NOT EXISTS and DO $$ blocks.
export const maxDuration = 60;

const SAFE_MIGRATION_SQL = `
-- =============================================
-- MQ Player — Safe migration (non-destructive)
-- =============================================

-- 1. Add missing columns to existing "User" table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'role') THEN
    ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'blocked') THEN
    ALTER TABLE "User" ADD COLUMN "blocked" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'blockedAt') THEN
    ALTER TABLE "User" ADD COLUMN "blockedAt" TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'blockedReason') THEN
    ALTER TABLE "User" ADD COLUMN "blockedReason" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'avatar') THEN
    ALTER TABLE "User" ADD COLUMN "avatar" TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'lastSeen') THEN
    ALTER TABLE "User" ADD COLUMN "lastSeen" TIMESTAMP;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Add missing columns to "Message" table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'messageType') THEN
    ALTER TABLE "Message" ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'text';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'replyToId') THEN
    ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'edited') THEN
    ALTER TABLE "Message" ADD COLUMN "edited" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'editedAt') THEN
    ALTER TABLE "Message" ADD COLUMN "editedAt" TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'deleted') THEN
    ALTER TABLE "Message" ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'voiceUrl') THEN
    ALTER TABLE "Message" ADD COLUMN "voiceUrl" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'voiceDuration') THEN
    ALTER TABLE "Message" ADD COLUMN "voiceDuration" DOUBLE PRECISION;
  END IF;
  -- Add foreign key for replyToId if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Message_replyToId_fkey' AND table_name = 'Message') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Add missing columns to "Friend" table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Friend' AND column_name = 'updatedAt') THEN
    ALTER TABLE "Friend" ADD COLUMN "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Create "AuditLog" table
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'AuditLog_adminId_fkey' AND table_name = 'AuditLog') THEN
    ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5. Create "Story" table
CREATE TABLE IF NOT EXISTS "Story" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "bgColor" TEXT NOT NULL DEFAULT '#1a1a2e',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP NOT NULL
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Story_userId_fkey' AND table_name = 'Story') THEN
    ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. Create "StoryLike" table
CREATE TABLE IF NOT EXISTS "StoryLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'StoryLike_storyId_fkey' AND table_name = 'StoryLike') THEN
    ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'StoryLike_userId_fkey' AND table_name = 'StoryLike') THEN
    ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'StoryLike_storyId_userId_key') THEN
    CREATE UNIQUE INDEX "StoryLike_storyId_userId_key" ON "StoryLike"("storyId", "userId");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7. Create "StoryComment" table
CREATE TABLE IF NOT EXISTS "StoryComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'StoryComment_storyId_fkey' AND table_name = 'StoryComment') THEN
    ALTER TABLE "StoryComment" ADD CONSTRAINT "StoryComment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'StoryComment_userId_fkey' AND table_name = 'StoryComment') THEN
    ALTER TABLE "StoryComment" ADD CONSTRAINT "StoryComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8. Create "VerificationCode" table
CREATE TABLE IF NOT EXISTS "VerificationCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'VerificationCode_email_code_key') THEN
    CREATE UNIQUE INDEX "VerificationCode_email_code_key" ON "VerificationCode"("email", "code");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 9. Create "Playlist" table
CREATE TABLE IF NOT EXISTS "Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cover" TEXT NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT NOT NULL DEFAULT '',
    "tracksJson" TEXT NOT NULL DEFAULT '[]',
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Playlist_userId_fkey' AND table_name = 'Playlist') THEN
    ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 10. Create "PlaylistLike" table
CREATE TABLE IF NOT EXISTS "PlaylistLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PlaylistLike_playlistId_fkey' AND table_name = 'PlaylistLike') THEN
    ALTER TABLE "PlaylistLike" ADD CONSTRAINT "PlaylistLike_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PlaylistLike_userId_fkey' AND table_name = 'PlaylistLike') THEN
    ALTER TABLE "PlaylistLike" ADD CONSTRAINT "PlaylistLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'PlaylistLike_playlistId_userId_key') THEN
    CREATE UNIQUE INDEX "PlaylistLike_playlistId_userId_key" ON "PlaylistLike"("playlistId", "userId");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 11. Create "SupportMessage" table
CREATE TABLE IF NOT EXISTS "SupportMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. Create "EmailCampaign" table
CREATE TABLE IF NOT EXISTS "EmailCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL DEFAULT '',
    "segment" TEXT NOT NULL DEFAULT 'all',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP
);

-- 13. Create "CronJob" table
CREATE TABLE IF NOT EXISTS "CronJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cronExpr" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastRun" TIMESTAMP,
    "nextRun" TIMESTAMP,
    "log" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. Create "Transaction" table
CREATE TABLE IF NOT EXISTS "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "type" TEXT NOT NULL DEFAULT 'subscription',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. Create "FeatureFlag" table
CREATE TABLE IF NOT EXISTS "FeatureFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'FeatureFlag_key_key') THEN
    CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 16. Create "SupportChatSession" table
CREATE TABLE IF NOT EXISTS "SupportChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "lastMessage" TEXT NOT NULL DEFAULT '',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'SupportChatSession_sessionId_key') THEN
    CREATE UNIQUE INDEX "SupportChatSession_sessionId_key" ON "SupportChatSession"("sessionId");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 17. Create "SupportChatMessage" table
CREATE TABLE IF NOT EXISTS "SupportChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'SupportChatMessage_sessionId_fkey' AND table_name = 'SupportChatMessage') THEN
    ALTER TABLE "SupportChatMessage" ADD CONSTRAINT "SupportChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SupportChatSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 18. Create "GroupChat" table
CREATE TABLE IF NOT EXISTS "GroupChat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'GroupChat_createdBy_fkey' AND table_name = 'GroupChat') THEN
    ALTER TABLE "GroupChat" ADD CONSTRAINT "GroupChat_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 19. Create "GroupChatMember" table
CREATE TABLE IF NOT EXISTS "GroupChatMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupChatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'GroupChatMember_groupChatId_fkey' AND table_name = 'GroupChatMember') THEN
    ALTER TABLE "GroupChatMember" ADD CONSTRAINT "GroupChatMember_groupChatId_fkey" FOREIGN KEY ("groupChatId") REFERENCES "GroupChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'GroupChatMember_userId_fkey' AND table_name = 'GroupChatMember') THEN
    ALTER TABLE "GroupChatMember" ADD CONSTRAINT "GroupChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'GroupChatMember_groupChatId_userId_key') THEN
    CREATE UNIQUE INDEX "GroupChatMember_groupChatId_userId_key" ON "GroupChatMember"("groupChatId", "userId");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 20. Create "GroupMessage" table
CREATE TABLE IF NOT EXISTS "GroupMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupChatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "replyToId" TEXT,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "voiceUrl" TEXT,
    "voiceDuration" DOUBLE PRECISION,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'GroupMessage_groupChatId_fkey' AND table_name = 'GroupMessage') THEN
    ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_groupChatId_fkey" FOREIGN KEY ("groupChatId") REFERENCES "GroupChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'GroupMessage_senderId_fkey' AND table_name = 'GroupMessage') THEN
    ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 21. Create "UserSync" table
CREATE TABLE IF NOT EXISTS "UserSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'UserSync_userId_fkey' AND table_name = 'UserSync') THEN
    ALTER TABLE "UserSync" ADD CONSTRAINT "UserSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'UserSync_userId_key_key') THEN
    CREATE UNIQUE INDEX "UserSync_userId_key_key" ON "UserSync"("userId", "key");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =============================================
-- CRITICAL TABLES — Listen together, typing, notifications
-- =============================================

-- 22. Create "ListenSession" table (critical for listen together feature)
CREATE TABLE IF NOT EXISTS "ListenSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL DEFAULT '',
    "trackTitle" TEXT NOT NULL DEFAULT '',
    "trackArtist" TEXT NOT NULL DEFAULT '',
    "trackCover" TEXT NOT NULL DEFAULT '',
    "scTrackId" INTEGER,
    "audioUrl" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'soundcloud',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPlaying" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ListenSession_hostId_fkey' AND table_name = 'ListenSession') THEN
    ALTER TABLE "ListenSession" ADD CONSTRAINT "ListenSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ListenSession_guestId_fkey' AND table_name = 'ListenSession') THEN
    ALTER TABLE "ListenSession" ADD CONSTRAINT "ListenSession_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ListenSession_hostId_guestId_key') THEN
    CREATE UNIQUE INDEX "ListenSession_hostId_guestId_key" ON "ListenSession"("hostId", "guestId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ListenSession_hostId_idx') THEN
    CREATE INDEX "ListenSession_hostId_idx" ON "ListenSession"("hostId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ListenSession_guestId_idx') THEN
    CREATE INDEX "ListenSession_guestId_idx" ON "ListenSession"("guestId");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 23. Create "TypingEvent" table (critical for typing indicators)
CREATE TABLE IF NOT EXISTS "TypingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'TypingEvent_userId_fkey' AND table_name = 'TypingEvent') THEN
    ALTER TABLE "TypingEvent" ADD CONSTRAINT "TypingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'TypingEvent_contactId_fkey' AND table_name = 'TypingEvent') THEN
    ALTER TABLE "TypingEvent" ADD CONSTRAINT "TypingEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'TypingEvent_userId_contactId_key') THEN
    CREATE UNIQUE INDEX "TypingEvent_userId_contactId_key" ON "TypingEvent"("userId", "contactId");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 24. Create "Notification" table (critical for notification system)
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Notification_userId_fkey' AND table_name = 'Notification') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Notification_userId_read_idx') THEN
    CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Notification_userId_createdAt_idx') THEN
    CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
`;

export async function GET() {
  try {
    // Auth: only admins can trigger DB migration
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Необходима авторизация" }, { status: 401 });
    }
    const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
    }

    // Execute the safe migration SQL
    await db.$executeRawUnsafe(SAFE_MIGRATION_SQL);

    return NextResponse.json({
      ok: true,
      message: "Database synced successfully",
    });
  } catch (error: any) {
    console.error("DB sync error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Migration failed",
        details: error.message || String(error),
      },
      { status: 500 }
    );
  }
}
