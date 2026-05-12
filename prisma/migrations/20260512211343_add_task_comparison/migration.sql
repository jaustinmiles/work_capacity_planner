-- CreateTable
CREATE TABLE "public"."TaskComparison" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemAId" TEXT NOT NULL,
    "itemBId" TEXT NOT NULL,
    "winnerId" TEXT,
    "dimension" TEXT NOT NULL,
    "isEqual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskComparison_sessionId_dimension_idx" ON "public"."TaskComparison"("sessionId", "dimension");

-- CreateIndex
CREATE INDEX "TaskComparison_itemAId_idx" ON "public"."TaskComparison"("itemAId");

-- CreateIndex
CREATE INDEX "TaskComparison_itemBId_idx" ON "public"."TaskComparison"("itemBId");

-- CreateIndex
CREATE INDEX "TaskComparison_winnerId_idx" ON "public"."TaskComparison"("winnerId");

-- AddForeignKey
ALTER TABLE "public"."TaskComparison" ADD CONSTRAINT "TaskComparison_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
