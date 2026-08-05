-- Grupos de validação do contrato (tickets 53–54) e vínculo opcional na funcionalidade.

CREATE TABLE "ContractValidationGroup" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractValidationGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractValidationGroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractValidationGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

CREATE INDEX "ContractValidationGroup_contractId_active_idx" ON "ContractValidationGroup"("contractId", "active");
CREATE INDEX "ContractValidationGroup_contractId_name_idx" ON "ContractValidationGroup"("contractId", "name");
CREATE INDEX "ContractValidationGroupMember_userId_idx" ON "ContractValidationGroupMember"("userId");

ALTER TABLE "ContractValidationGroup"
ADD CONSTRAINT "ContractValidationGroup_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractValidationGroupMember"
ADD CONSTRAINT "ContractValidationGroupMember_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "ContractValidationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractValidationGroupMember"
ADD CONSTRAINT "ContractValidationGroupMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractFeature"
ADD COLUMN "validation_group_id" TEXT;

CREATE INDEX "ContractFeature_validation_group_id_idx" ON "ContractFeature"("validation_group_id");

ALTER TABLE "ContractFeature"
ADD CONSTRAINT "ContractFeature_validation_group_id_fkey"
FOREIGN KEY ("validation_group_id") REFERENCES "ContractValidationGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
