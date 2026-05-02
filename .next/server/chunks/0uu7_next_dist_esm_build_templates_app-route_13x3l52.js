module.exports=[1640,e=>{"use strict";var E=e.i(16037),T=e.i(35221),t=e.i(37104),N=e.i(91015),a=e.i(56932),n=e.i(18025),s=e.i(40475),r=e.i(68654),i=e.i(52288),L=e.i(64847),o=e.i(77745),I=e.i(30481),A=e.i(73157),O=e.i(52640),d=e.i(2652),S=e.i(93695);e.i(39994);var R=e.i(44405),l=e.i(67533),C=e.i(31835),D=e.i(88014);let U=`
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
`;async function u(){try{let e=await (0,D.getSession)();if(!e)return l.NextResponse.json({ok:!1,error:"Необходима авторизация"},{status:401});let E=await C.db.user.findUnique({where:{id:e.userId},select:{role:!0}});if(!E||"admin"!==E.role)return l.NextResponse.json({ok:!1,error:"Доступ запрещён"},{status:403});return await C.db.$executeRawUnsafe(U),l.NextResponse.json({ok:!0,message:"Database synced successfully"})}catch(e){return console.error("DB sync error:",e),l.NextResponse.json({ok:!1,error:"Migration failed"},{status:500})}}e.s(["GET",0,u,"maxDuration",0,60],48810);var c=e.i(48810);let _=new E.AppRouteRouteModule({definition:{kind:T.RouteKind.APP_ROUTE,page:"/api/db-sync/route",pathname:"/api/db-sync",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/my-project/mq-player/src/app/api/db-sync/route.ts",nextConfigOutput:"",userland:c,...{}}),{workAsyncStorage:F,workUnitAsyncStorage:m,serverHooks:M}=_;async function p(e,E,t){t.requestMeta&&(0,N.setRequestMeta)(e,t.requestMeta),_.isDev&&(0,N.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let l="/api/db-sync/route";l=l.replace(/\/index$/,"")||"/";let C=await _.prepare(e,E,{srcPage:l,multiZoneDraftMode:!1});if(!C)return E.statusCode=400,E.end("Bad Request"),null==t.waitUntil||t.waitUntil.call(t,Promise.resolve()),null;let{buildId:D,params:U,nextConfig:u,parsedUrl:c,isDraftMode:F,prerenderManifest:m,routerServerContext:M,isOnDemandRevalidate:p,revalidateOnlyGenerated:y,resolvedPathname:X,clientReferenceManifest:P,serverActionsManifest:H}=C,f=(0,s.normalizeAppPath)(l),g=!!(m.dynamicRoutes[f]||m.routes[X]),h=async()=>((null==M?void 0:M.render404)?await M.render404(e,E,c,!1):E.end("This page could not be found"),null);if(g&&!F){let e=!!m.routes[X],E=m.dynamicRoutes[f];if(E&&!1===E.fallback&&!e){if(u.adapterPath)return await h();throw new S.NoFallbackError}}let b=null;!g||_.isDev||F||(b="/index"===(b=X)?"/":b);let k=!0===_.isDev||!g,B=g&&!k;H&&P&&(0,n.setManifestsSingleton)({page:l,clientReferenceManifest:P,serverActionsManifest:H});let $=e.method||"GET",G=(0,a.getTracer)(),x=G.getActiveScopeSpan(),v=!!(null==M?void 0:M.isWrappedByNextServer),W=!!(0,N.getRequestMeta)(e,"minimalMode"),Y=(0,N.getRequestMeta)(e,"incrementalCache")||await _.getIncrementalCache(e,u,m,W);null==Y||Y.resetRequestCache(),globalThis.__incrementalCache=Y;let K={params:U,previewProps:m.preview,renderOpts:{experimental:{authInterrupts:!!u.experimental.authInterrupts},cacheComponents:!!u.cacheComponents,supportsDynamicResponse:k,incrementalCache:Y,cacheLifeProfiles:u.cacheLife,waitUntil:t.waitUntil,onClose:e=>{E.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(E,T,t,N)=>_.onRequestError(e,E,t,N,M)},sharedContext:{buildId:D}},w=new r.NodeNextRequest(e),q=new r.NodeNextResponse(E),j=i.NextRequestAdapter.fromNodeNextRequest(w,(0,i.signalFromNodeResponse)(E));try{let N,n=async e=>_.handle(j,K).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":E.statusCode,"next.rsc":!1});let T=G.getRootSpanAttributes();if(!T)return;if(T.get("next.span_type")!==L.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${T.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let t=T.get("next.route");if(t){let E=`${$} ${t}`;e.setAttributes({"next.route":t,"http.route":t,"next.span_name":E}),e.updateName(E),N&&N!==e&&(N.setAttribute("http.route",t),N.updateName(E))}else e.updateName(`${$} ${l}`)}),s=async N=>{var a,s;let r=async({previousCacheEntry:T})=>{try{if(!W&&p&&y&&!T)return E.statusCode=404,E.setHeader("x-nextjs-cache","REVALIDATED"),E.end("This page could not be found"),null;let a=await n(N);e.fetchMetrics=K.renderOpts.fetchMetrics;let s=K.renderOpts.pendingWaitUntil;s&&t.waitUntil&&(t.waitUntil(s),s=void 0);let r=K.renderOpts.collectedTags;if(!g)return await (0,I.sendResponse)(w,q,a,K.renderOpts.pendingWaitUntil),null;{let e=await a.blob(),E=(0,A.toNodeOutgoingHttpHeaders)(a.headers);r&&(E[d.NEXT_CACHE_TAGS_HEADER]=r),!E["content-type"]&&e.type&&(E["content-type"]=e.type);let T=void 0!==K.renderOpts.collectedRevalidate&&!(K.renderOpts.collectedRevalidate>=d.INFINITE_CACHE)&&K.renderOpts.collectedRevalidate,t=void 0===K.renderOpts.collectedExpire||K.renderOpts.collectedExpire>=d.INFINITE_CACHE?void 0:K.renderOpts.collectedExpire;return{value:{kind:R.CachedRouteKind.APP_ROUTE,status:a.status,body:Buffer.from(await e.arrayBuffer()),headers:E},cacheControl:{revalidate:T,expire:t}}}}catch(E){throw(null==T?void 0:T.isStale)&&await _.onRequestError(e,E,{routerKind:"App Router",routePath:l,routeType:"route",revalidateReason:(0,o.getRevalidateReason)({isStaticGeneration:B,isOnDemandRevalidate:p})},!1,M),E}},i=await _.handleResponse({req:e,nextConfig:u,cacheKey:b,routeKind:T.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:m,isRoutePPREnabled:!1,isOnDemandRevalidate:p,revalidateOnlyGenerated:y,responseGenerator:r,waitUntil:t.waitUntil,isMinimalMode:W});if(!g)return null;if((null==i||null==(a=i.value)?void 0:a.kind)!==R.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==i||null==(s=i.value)?void 0:s.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});W||E.setHeader("x-nextjs-cache",p?"REVALIDATED":i.isMiss?"MISS":i.isStale?"STALE":"HIT"),F&&E.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let L=(0,A.fromNodeOutgoingHttpHeaders)(i.value.headers);return W&&g||L.delete(d.NEXT_CACHE_TAGS_HEADER),!i.cacheControl||E.getHeader("Cache-Control")||L.get("Cache-Control")||L.set("Cache-Control",(0,O.getCacheControlHeader)(i.cacheControl)),await (0,I.sendResponse)(w,q,new Response(i.value.body,{headers:L,status:i.value.status||200})),null};v&&x?await s(x):(N=G.getActiveScopeSpan(),await G.withPropagatedContext(e.headers,()=>G.trace(L.BaseServerSpan.handleRequest,{spanName:`${$} ${l}`,kind:a.SpanKind.SERVER,attributes:{"http.method":$,"http.target":e.url}},s),void 0,!v))}catch(E){if(E instanceof S.NoFallbackError||await _.onRequestError(e,E,{routerKind:"App Router",routePath:f,routeType:"route",revalidateReason:(0,o.getRevalidateReason)({isStaticGeneration:B,isOnDemandRevalidate:p})},!1,M),g)throw E;return await (0,I.sendResponse)(w,q,new Response(null,{status:500})),null}}e.s(["handler",0,p,"patchFetch",0,function(){return(0,t.patchFetch)({workAsyncStorage:F,workUnitAsyncStorage:m})},"routeModule",0,_,"serverHooks",0,M,"workAsyncStorage",0,F,"workUnitAsyncStorage",0,m],1640)}];

//# sourceMappingURL=0uu7_next_dist_esm_build_templates_app-route_13x3l52.js.map