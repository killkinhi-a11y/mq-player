-- CreateTable
CREATE TABLE "ListeningStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "trackTitle" TEXT NOT NULL,
    "trackArtist" TEXT NOT NULL,
    "trackCover" TEXT NOT NULL DEFAULT '',
    "scTrackId" INTEGER,
    "isPlaying" BOOLEAN NOT NULL DEFAULT true,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'soundcloud',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListeningStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListeningStatus_userId_key" ON "ListeningStatus"("userId");

-- CreateIndex
CREATE INDEX "ListeningStatus_updatedAt_idx" ON "ListeningStatus"("updatedAt");

-- AddForeignKey
ALTER TABLE "ListeningStatus" ADD CONSTRAINT "ListeningStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "trackTitle" TEXT NOT NULL,
    "trackArtist" TEXT NOT NULL,
    "trackCover" TEXT NOT NULL DEFAULT '',
    "scTrackId" INTEGER,
    "audioUrl" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'soundcloud',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPlaying" BOOLEAN NOT NULL DEFAULT true,
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_code_key" ON "LiveSession"("code");

-- CreateIndex
CREATE INDEX "LiveSession_hostId_idx" ON "LiveSession"("hostId");

-- CreateIndex
CREATE INDEX "LiveSession_code_idx" ON "LiveSession"("code");

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "LiveSessionMember" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT '',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSessionMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveSessionMember_sessionId_userId_key" ON "LiveSessionMember"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "LiveSessionMember_sessionId_idx" ON "LiveSessionMember"("sessionId");

-- AddForeignKey
ALTER TABLE "LiveSessionMember" ADD CONSTRAINT "LiveSessionMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
