-- CreateTable
CREATE TABLE "public"."AgentMemory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "source" TEXT NOT NULL DEFAULT 'agent_observed',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversationSummary" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyDecisions" TEXT NOT NULL DEFAULT '[]',
    "memoriesExtracted" TEXT NOT NULL DEFAULT '[]',
    "messageCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentMemory_sessionId_idx" ON "public"."AgentMemory"("sessionId");

-- CreateIndex
CREATE INDEX "AgentMemory_category_idx" ON "public"."AgentMemory"("category");

-- CreateIndex
CREATE INDEX "AgentMemory_updatedAt_idx" ON "public"."AgentMemory"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_sessionId_key_key" ON "public"."AgentMemory"("sessionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSummary_conversationId_key" ON "public"."ConversationSummary"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationSummary_sessionId_idx" ON "public"."ConversationSummary"("sessionId");

-- CreateIndex
CREATE INDEX "ConversationSummary_createdAt_idx" ON "public"."ConversationSummary"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."AgentMemory" ADD CONSTRAINT "AgentMemory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationSummary" ADD CONSTRAINT "ConversationSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationSummary" ADD CONSTRAINT "ConversationSummary_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
