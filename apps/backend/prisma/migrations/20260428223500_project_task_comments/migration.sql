-- CreateTable
CREATE TABLE "ProjectTaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorEmail" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTaskComment_taskId_createdAt_idx" ON "ProjectTaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectTaskComment_authorId_createdAt_idx" ON "ProjectTaskComment"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectTaskComment" ADD CONSTRAINT "ProjectTaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskComment" ADD CONSTRAINT "ProjectTaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
