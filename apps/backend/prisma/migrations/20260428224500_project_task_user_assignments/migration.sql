-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN "assigneeUserId" TEXT;

-- CreateTable
CREATE TABLE "ProjectTaskResponsible" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTaskResponsible_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "ProjectTask_assigneeUserId_idx" ON "ProjectTask"("assigneeUserId");

-- CreateIndex
CREATE INDEX "ProjectTaskResponsible_userId_createdAt_idx" ON "ProjectTaskResponsible"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskResponsible" ADD CONSTRAINT "ProjectTaskResponsible_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskResponsible" ADD CONSTRAINT "ProjectTaskResponsible_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
