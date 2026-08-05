-- Ticket 19: corrige backfill que tratou códigos internos (ST-2026-009) como número formal.

-- 1) Promove number no formato ACRONYM-YEAR-SEQ para internal_code quando ainda vazio.
UPDATE "Contract" c
SET "internal_code" = c.number
WHERE c."deletedAt" IS NULL
  AND c."internal_code" IS NULL
  AND c.number ~ '^[A-Za-z]{1,16}-[0-9]{4}-[0-9]{1,8}$'
  AND NOT EXISTS (
    SELECT 1 FROM "Contract" other
    WHERE other."internal_code" = c.number
      AND other.id <> c.id
  );

-- 2) Limpa formal_number gerado só com dígitos do código interno (ex.: ST-2026-009 → 2026009).
UPDATE "Contract" c
SET "formal_number" = NULL
WHERE c."deletedAt" IS NULL
  AND c."formal_number" IS NOT NULL
  AND (
    (
      c."internal_code" IS NOT NULL
      AND regexp_replace(c."internal_code", '\D', '', 'g') = c."formal_number"
    )
    OR (
      c.number ~ '^[A-Za-z]{1,16}-[0-9]{4}-[0-9]{1,8}$'
      AND regexp_replace(c.number, '\D', '', 'g') = c."formal_number"
    )
  );

-- 3) Ano formal a partir do início da vigência quando ausente.
UPDATE "Contract"
SET "contract_year" = EXTRACT(YEAR FROM ("startDate" AT TIME ZONE 'UTC'))::integer
WHERE "deletedAt" IS NULL
  AND "contract_year" IS NULL
  AND "startDate" IS NOT NULL;

-- 4) Vincula tipo de contrato pela sigla do código interno, se ainda sem catálogo.
UPDATE "Contract" c
SET "contract_type_catalog_id" = t.id
FROM "contract_type_catalog" t
WHERE c."deletedAt" IS NULL
  AND c."contract_type_catalog_id" IS NULL
  AND c."internal_code" IS NOT NULL
  AND upper(split_part(c."internal_code", '-', 1)) = upper(t.acronym);

-- 5) Atualiza sequenciadores a partir dos códigos internos já existentes.
INSERT INTO "contract_internal_code_sequence" ("id", "contract_type_catalog_id", "year", "last_sequential")
SELECT
  md5(c."contract_type_catalog_id" || ':' || split_part(c."internal_code", '-', 2)),
  c."contract_type_catalog_id",
  (split_part(c."internal_code", '-', 2))::integer AS year,
  MAX((split_part(c."internal_code", '-', 3))::integer) AS last_seq
FROM "Contract" c
WHERE c."deletedAt" IS NULL
  AND c."internal_code" IS NOT NULL
  AND c."contract_type_catalog_id" IS NOT NULL
  AND c."internal_code" ~ '^[A-Za-z]{1,16}-[0-9]{4}-[0-9]{1,8}$'
GROUP BY c."contract_type_catalog_id", (split_part(c."internal_code", '-', 2))::integer
ON CONFLICT ("contract_type_catalog_id", "year")
DO UPDATE SET
  "last_sequential" = GREATEST(
    "contract_internal_code_sequence"."last_sequential",
    EXCLUDED."last_sequential"
  );
