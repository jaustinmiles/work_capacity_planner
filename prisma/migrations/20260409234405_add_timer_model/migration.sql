-- CreateTable
CREATE TABLE "public"."Timer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "originalDurationMinutes" INTEGER NOT NULL,
    "extendedByMinutes" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "pausedRemainingMs" INTEGER,
    "expiredAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "linkedTaskId" TEXT,
    "linkedStepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Timer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Timer_sessionId_idx" ON "public"."Timer"("sessionId");

-- CreateIndex
CREATE INDEX "Timer_status_idx" ON "public"."Timer"("status");

-- CreateIndex
CREATE INDEX "Timer_expiresAt_idx" ON "public"."Timer"("expiresAt");

-- CreateIndex
CREATE INDEX "Timer_linkedTaskId_idx" ON "public"."Timer"("linkedTaskId");

-- CreateIndex
CREATE INDEX "Timer_linkedStepId_idx" ON "public"."Timer"("linkedStepId");

-- AddForeignKey
ALTER TABLE "public"."Timer" ADD CONSTRAINT "Timer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Timer" ADD CONSTRAINT "Timer_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
