CREATE UNIQUE INDEX IF NOT EXISTS contract_formal_number_year_uidx
ON "Contract" ("formal_number", "contract_year")
WHERE "deletedAt" IS NULL AND "formal_number" IS NOT NULL;
