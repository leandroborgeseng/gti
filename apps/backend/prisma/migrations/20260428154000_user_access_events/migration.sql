-- CreateTable
CREATE TABLE "UserAccessEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "path" TEXT,
    "pathLabel" TEXT,
    "sessionId" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAccessEvent_userId_occurredAt_idx" ON "UserAccessEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "UserAccessEvent_userEmail_occurredAt_idx" ON "UserAccessEvent"("userEmail", "occurredAt");

-- CreateIndex
CREATE INDEX "UserAccessEvent_eventType_occurredAt_idx" ON "UserAccessEvent"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "UserAccessEvent_path_occurredAt_idx" ON "UserAccessEvent"("path", "occurredAt");

-- AddForeignKey
ALTER TABLE "UserAccessEvent" ADD CONSTRAINT "UserAccessEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
