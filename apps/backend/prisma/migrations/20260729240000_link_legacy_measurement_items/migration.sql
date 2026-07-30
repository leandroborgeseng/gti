-- Backfill seguro: só vincula módulos quando há uma única base de glosa ativa
-- no contrato, evitando escolher arbitrariamente entre vários itens.
UPDATE "ContractModule" AS m
SET "glosa_pricing_item_id" = sub.item_id
FROM (
  SELECT cpi."contract_id", MIN(cpi."id") AS item_id
  FROM "contract_pricing_item" AS cpi
  JOIN "contract_item_type" AS t ON t."id" = cpi."type_id"
  WHERE cpi."status" = 'ACTIVE'
    AND cpi."include_in_glosa_base" = true
  GROUP BY cpi."contract_id"
  HAVING COUNT(*) = 1
) AS sub
WHERE m."contractId" = sub."contract_id"
  AND m."glosa_pricing_item_id" IS NULL;
