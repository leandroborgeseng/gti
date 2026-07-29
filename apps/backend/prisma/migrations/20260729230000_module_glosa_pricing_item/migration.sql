ALTER TABLE "ContractModule" ADD COLUMN IF NOT EXISTS "glosa_pricing_item_id" TEXT;
CREATE INDEX IF NOT EXISTS "ContractModule_glosa_pricing_item_id_idx" ON "ContractModule"("glosa_pricing_item_id");
ALTER TABLE "ContractModule" ADD CONSTRAINT "ContractModule_glosa_pricing_item_id_fkey" FOREIGN KEY ("glosa_pricing_item_id") REFERENCES "contract_pricing_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
