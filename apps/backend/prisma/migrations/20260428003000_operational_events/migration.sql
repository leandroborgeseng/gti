-- CreateTable
CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalEvent_occurredAt_idx" ON "OperationalEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "OperationalEvent_category_occurredAt_idx" ON "OperationalEvent"("category", "occurredAt");

-- CreateIndex
CREATE INDEX "OperationalEvent_entity_entityId_idx" ON "OperationalEvent"("entity", "entityId");

-- CreateIndex
CREATE INDEX "OperationalEvent_type_occurredAt_idx" ON "OperationalEvent"("type", "occurredAt");
