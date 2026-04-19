-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('SOFTWARE', 'DATACENTER', 'INFRA', 'SERVICO');

-- CreateEnum
CREATE TYPE "LawType" AS ENUM ('LEI_8666', 'LEI_14133');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ContractFeatureStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DELIVERED', 'VALIDATED');

-- CreateEnum
CREATE TYPE "MeasurementStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'APPROVED', 'GLOSSED');

-- CreateEnum
CREATE TYPE "MeasurementItemType" AS ENUM ('FEATURE', 'SERVICE');

-- CreateEnum
CREATE TYPE "GlosaType" AS ENUM ('ATRASO', 'NAO_ENTREGA', 'SLA', 'QUALIDADE');

-- CreateEnum
CREATE TYPE "GovernancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "GovernanceType" AS ENUM ('CORRETIVA', 'EVOLUTIVA');

-- CreateEnum
CREATE TYPE "TicketGovernanceStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'SLA_VIOLATED', 'EXTENDED_DEADLINE', 'ESCALATED', 'SENT_TO_CONTROLADORIA');

-- CreateEnum
CREATE TYPE "TicketEventType" AS ENUM ('OPENED', 'ACKNOWLEDGED', 'SLA_VIOLATED', 'MANAGER_NOTIFIED', 'DEADLINE_EXTENDED', 'ESCALATED', 'SENT_TO_CONTROLADORIA');

-- CreateEnum
CREATE TYPE "TicketWatcherRole" AS ENUM ('GESTOR', 'CONTROLADORIA', 'OBSERVADOR');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GoalActionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GoalLinkType" AS ENUM ('CONTRACT', 'TICKET');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fiscal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "Fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "companyName" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "lawType" "LawType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalValue" DECIMAL(18,2) NOT NULL,
    "monthlyValue" DECIMAL(18,2) NOT NULL,
    "status" "ContractStatus" NOT NULL,
    "slaTarget" DECIMAL(5,2),
    "fiscalId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAmendment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "referenceCode" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "previousTotalValue" DECIMAL(18,2) NOT NULL,
    "previousMonthlyValue" DECIMAL(18,2) NOT NULL,
    "previousEndDate" TIMESTAMP(3) NOT NULL,
    "newTotalValue" DECIMAL(18,2) NOT NULL,
    "newMonthlyValue" DECIMAL(18,2) NOT NULL,
    "newEndDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractModule" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DECIMAL(8,4) NOT NULL,

    CONSTRAINT "ContractModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractFeature" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DECIMAL(8,4) NOT NULL,
    "status" "ContractFeatureStatus" NOT NULL DEFAULT 'NOT_STARTED',

    CONSTRAINT "ContractFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractService" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitValue" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "ContractService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "referenceMonth" INTEGER NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "status" "MeasurementStatus" NOT NULL DEFAULT 'OPEN',
    "totalMeasuredValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalApprovedValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalGlosedValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementItem" (
    "id" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "type" "MeasurementItemType" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "calculatedValue" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "MeasurementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Glosa" (
    "id" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "type" "GlosaType" NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "justification" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Glosa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oldData" JSONB,
    "newData" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketGovernance" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "priority" "GovernancePriority",
    "type" "GovernanceType",
    "slaDeadline" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "status" "TicketGovernanceStatus" NOT NULL DEFAULT 'OPEN',
    "managerNotified" BOOLEAN NOT NULL DEFAULT false,
    "controladoriaNotified" BOOLEAN NOT NULL DEFAULT false,
    "seiProcessNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketGovernance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketDeadlineExtension" (
    "id" TEXT NOT NULL,
    "ticketGovernanceId" TEXT NOT NULL,
    "previousDeadline" TIMESTAMP(3) NOT NULL,
    "newDeadline" TIMESTAMP(3) NOT NULL,
    "justification" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketDeadlineExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEventLog" (
    "id" TEXT NOT NULL,
    "ticketGovernanceId" TEXT NOT NULL,
    "type" "TicketEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketWatcher" (
    "id" TEXT NOT NULL,
    "ticketGovernanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TicketWatcherRole" NOT NULL,

    CONSTRAINT "TicketWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "year" INTEGER NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" TEXT NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalAction" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "GoalActionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "responsibleId" TEXT NOT NULL,

    CONSTRAINT "GoalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalLink" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "type" "GoalLinkType" NOT NULL,
    "referenceId" TEXT NOT NULL,

    CONSTRAINT "GoalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "measurementId" TEXT,
    "glosaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "glpiTicketId" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "status" TEXT,
    "priority" TEXT,
    "dateCreation" TEXT,
    "dateModification" TEXT,
    "contractGroupId" INTEGER,
    "contractGroupName" TEXT,
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "requesterUserId" INTEGER,
    "waitingParty" TEXT,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAttribute" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "keyPath" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "valueText" TEXT,
    "valueJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_cnpj_key" ON "Supplier"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Fiscal_email_key" ON "Fiscal"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_number_key" ON "Contract"("number");

-- CreateIndex
CREATE INDEX "Contract_status_endDate_idx" ON "Contract"("status", "endDate");

-- CreateIndex
CREATE INDEX "Contract_deletedAt_idx" ON "Contract"("deletedAt");

-- CreateIndex
CREATE INDEX "ContractAmendment_contractId_createdAt_idx" ON "ContractAmendment"("contractId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_contractId_referenceMonth_referenceYear_key" ON "Measurement"("contractId", "referenceMonth", "referenceYear");

-- CreateIndex
CREATE INDEX "TicketGovernance_ticketId_idx" ON "TicketGovernance"("ticketId");

-- CreateIndex
CREATE INDEX "TicketGovernance_status_slaDeadline_idx" ON "TicketGovernance"("status", "slaDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "TicketWatcher_ticketGovernanceId_userId_role_key" ON "TicketWatcher"("ticketGovernanceId", "userId", "role");

-- CreateIndex
CREATE INDEX "Goal_year_status_idx" ON "Goal"("year", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_glpiTicketId_key" ON "Ticket"("glpiTicketId");

-- CreateIndex
CREATE INDEX "Ticket_waitingParty_idx" ON "Ticket"("waitingParty");

-- CreateIndex
CREATE INDEX "Ticket_requesterEmail_idx" ON "Ticket"("requesterEmail");

-- CreateIndex
CREATE INDEX "Ticket_status_dateCreation_idx" ON "Ticket"("status", "dateCreation");

-- CreateIndex
CREATE INDEX "Ticket_dateModification_idx" ON "Ticket"("dateModification");

-- CreateIndex
CREATE INDEX "TicketAttribute_keyPath_idx" ON "TicketAttribute"("keyPath");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAttribute_ticketId_keyPath_key" ON "TicketAttribute"("ticketId", "keyPath");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_fiscalId_fkey" FOREIGN KEY ("fiscalId") REFERENCES "Fiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Fiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractModule" ADD CONSTRAINT "ContractModule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractFeature" ADD CONSTRAINT "ContractFeature_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ContractModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractService" ADD CONSTRAINT "ContractService_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementItem" ADD CONSTRAINT "MeasurementItem_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Glosa" ADD CONSTRAINT "Glosa_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketGovernance" ADD CONSTRAINT "TicketGovernance_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketDeadlineExtension" ADD CONSTRAINT "TicketDeadlineExtension_ticketGovernanceId_fkey" FOREIGN KEY ("ticketGovernanceId") REFERENCES "TicketGovernance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventLog" ADD CONSTRAINT "TicketEventLog_ticketGovernanceId_fkey" FOREIGN KEY ("ticketGovernanceId") REFERENCES "TicketGovernance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWatcher" ADD CONSTRAINT "TicketWatcher_ticketGovernanceId_fkey" FOREIGN KEY ("ticketGovernanceId") REFERENCES "TicketGovernance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalAction" ADD CONSTRAINT "GoalAction_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalLink" ADD CONSTRAINT "GoalLink_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_glosaId_fkey" FOREIGN KEY ("glosaId") REFERENCES "Glosa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttribute" ADD CONSTRAINT "TicketAttribute_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

