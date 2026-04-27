-- RemoveHierarchyForeignKey
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_parentProjectId_fkey";

-- RemoveHierarchyIndex
DROP INDEX IF EXISTS "Project_parentProjectId_idx";

-- CreateTable
CREATE TABLE "ProjectCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCollection_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Project" DROP COLUMN IF EXISTS "parentProjectId",
ADD COLUMN "projectCollectionId" TEXT;

-- CreateIndex
CREATE INDEX "Project_projectCollectionId_idx" ON "Project"("projectCollectionId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectCollectionId_fkey" FOREIGN KEY ("projectCollectionId") REFERENCES "ProjectCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
