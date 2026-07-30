ALTER TABLE "contract_pricing_item" ADD COLUMN IF NOT EXISTS "include_in_glosa_base" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: para cada contrato, marca o primeiro item ativo de mensalidade/glosa como base quando nenhum foi definido.
UPDATE "contract_pricing_item" cpi
SET "include_in_glosa_base" = true
WHERE cpi.id IN (
  SELECT DISTINCT ON (cpi2.contract_id) cpi2.id
  FROM "contract_pricing_item" cpi2
  JOIN "contract_item_type" t ON t.id = cpi2.type_id
  WHERE cpi2.status = 'ACTIVE'
    AND (t.participates_in_glosa = true OR t.code = 'MENSALIDADE')
  ORDER BY cpi2.contract_id, cpi2.sequence ASC
);
