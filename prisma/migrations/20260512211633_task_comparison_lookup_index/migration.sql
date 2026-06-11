-- CreateIndex
CREATE INDEX "TaskComparison_sessionId_itemAId_itemBId_dimension_idx" ON "public"."TaskComparison"("sessionId", "itemAId", "itemBId", "dimension");
