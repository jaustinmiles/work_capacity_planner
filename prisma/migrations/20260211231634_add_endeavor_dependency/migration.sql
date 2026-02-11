-- CreateTable
CREATE TABLE "public"."EndeavorDependency" (
    "id" TEXT NOT NULL,
    "endeavorId" TEXT NOT NULL,
    "blockedTaskId" TEXT,
    "blockedStepId" TEXT,
    "blockingStepId" TEXT NOT NULL,
    "blockingTaskId" TEXT NOT NULL,
    "isHardBlock" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EndeavorDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EndeavorDependency_endeavorId_idx" ON "public"."EndeavorDependency"("endeavorId");

-- CreateIndex
CREATE INDEX "EndeavorDependency_blockedTaskId_idx" ON "public"."EndeavorDependency"("blockedTaskId");

-- CreateIndex
CREATE INDEX "EndeavorDependency_blockedStepId_idx" ON "public"."EndeavorDependency"("blockedStepId");

-- CreateIndex
CREATE INDEX "EndeavorDependency_blockingStepId_idx" ON "public"."EndeavorDependency"("blockingStepId");

-- CreateIndex
CREATE UNIQUE INDEX "EndeavorDependency_endeavorId_blockedTaskId_blockedStepId_b_key" ON "public"."EndeavorDependency"("endeavorId", "blockedTaskId", "blockedStepId", "blockingStepId");

-- AddForeignKey
ALTER TABLE "public"."EndeavorDependency" ADD CONSTRAINT "EndeavorDependency_endeavorId_fkey" FOREIGN KEY ("endeavorId") REFERENCES "public"."Endeavor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
