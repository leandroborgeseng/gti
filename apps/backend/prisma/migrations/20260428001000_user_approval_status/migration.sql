-- CreateEnum
CREATE TYPE "UserApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "approvalStatus" "UserApprovalStatus" NOT NULL DEFAULT 'APPROVED';
