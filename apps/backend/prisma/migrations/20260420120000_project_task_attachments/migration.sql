-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "projectTaskId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_projectTaskId_idx" ON "Attachment"("projectTaskId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectTaskId_fkey" FOREIGN KEY ("projectTaskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
