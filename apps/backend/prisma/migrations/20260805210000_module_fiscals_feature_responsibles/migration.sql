-- Fiscais responsáveis do módulo (N:N) e responsáveis específicos da funcionalidade (N:N).

CREATE TABLE "ContractModuleFiscal" (
    "moduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractModuleFiscal_pkey" PRIMARY KEY ("moduleId","userId")
);

CREATE TABLE "ContractFeatureResponsible" (
    "featureId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractFeatureResponsible_pkey" PRIMARY KEY ("featureId","userId")
);

CREATE INDEX "ContractModuleFiscal_userId_idx" ON "ContractModuleFiscal"("userId");
CREATE INDEX "ContractFeatureResponsible_userId_idx" ON "ContractFeatureResponsible"("userId");

ALTER TABLE "ContractModuleFiscal"
ADD CONSTRAINT "ContractModuleFiscal_moduleId_fkey"
FOREIGN KEY ("moduleId") REFERENCES "ContractModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractModuleFiscal"
ADD CONSTRAINT "ContractModuleFiscal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractFeatureResponsible"
ADD CONSTRAINT "ContractFeatureResponsible_featureId_fkey"
FOREIGN KEY ("featureId") REFERENCES "ContractFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractFeatureResponsible"
ADD CONSTRAINT "ContractFeatureResponsible_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migra o fiscal único legado sem duplicar vínculos.
INSERT INTO "ContractModuleFiscal" ("moduleId", "userId", "createdAt")
SELECT m."id", m."fiscal_responsavel_id", CURRENT_TIMESTAMP
FROM "ContractModule" m
WHERE m."fiscal_responsavel_id" IS NOT NULL
ON CONFLICT ("moduleId", "userId") DO NOTHING;
