-- Anexos de cronograma contratual.

ALTER TABLE "Attachment" ADD COLUMN "schedule_id" TEXT;

CREATE INDEX "Attachment_schedule_id_idx" ON "Attachment"("schedule_id");

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "contract_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
