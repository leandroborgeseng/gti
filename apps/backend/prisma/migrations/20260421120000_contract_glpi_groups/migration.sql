-- Vínculo N:N entre contratos e grupos de trabalho atribuídos no GLPI (para métricas de SLA).

CREATE TABLE "ContractGlpiGroup" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "glpiGroupId" INTEGER NOT NULL,
    "glpiGroupName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractGlpiGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractGlpiGroup_contractId_glpiGroupId_key" ON "ContractGlpiGroup"("contractId", "glpiGroupId");

CREATE INDEX "ContractGlpiGroup_glpiGroupId_idx" ON "ContractGlpiGroup"("glpiGroupId");

ALTER TABLE "ContractGlpiGroup" ADD CONSTRAINT "ContractGlpiGroup_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
