-- CreateTable
CREATE TABLE "public"."DecisionSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "topic" TEXT,
    "decisionState" TEXT NOT NULL DEFAULT '{}',
    "connectivity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "conversationId" TEXT,

    CONSTRAINT "DecisionSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionSession_sessionId_idx" ON "public"."DecisionSession"("sessionId");

-- CreateIndex
CREATE INDEX "DecisionSession_isActive_idx" ON "public"."DecisionSession"("isActive");

-- AddForeignKey
ALTER TABLE "public"."DecisionSession" ADD CONSTRAINT "DecisionSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DecisionSession" ADD CONSTRAINT "DecisionSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
