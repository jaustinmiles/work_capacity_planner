-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "plainText" TEXT NOT NULL DEFAULT '',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MindMapScene" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "zoom" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "panX" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "panY" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MindMapScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MindMapNode" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "summary" TEXT,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "refId" TEXT,
    "sourceEntryId" TEXT,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 180,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MindMapNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MindMapEdge" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "label" TEXT,
    "sourceEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MindMapEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_sessionId_idx" ON "JournalEntry"("sessionId");

-- CreateIndex
CREATE INDEX "JournalEntry_sessionId_entryDate_idx" ON "JournalEntry"("sessionId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "MindMapScene_sessionId_key" ON "MindMapScene"("sessionId");

-- CreateIndex
CREATE INDEX "MindMapScene_sessionId_idx" ON "MindMapScene"("sessionId");

-- CreateIndex
CREATE INDEX "MindMapNode_sceneId_idx" ON "MindMapNode"("sceneId");

-- CreateIndex
CREATE INDEX "MindMapNode_sceneId_kind_idx" ON "MindMapNode"("sceneId", "kind");

-- CreateIndex
CREATE INDEX "MindMapNode_sourceEntryId_idx" ON "MindMapNode"("sourceEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "MindMapNode_sceneId_normalizedLabel_key" ON "MindMapNode"("sceneId", "normalizedLabel");

-- CreateIndex
CREATE INDEX "MindMapEdge_sceneId_idx" ON "MindMapEdge"("sceneId");

-- CreateIndex
CREATE INDEX "MindMapEdge_sourceNodeId_idx" ON "MindMapEdge"("sourceNodeId");

-- CreateIndex
CREATE INDEX "MindMapEdge_targetNodeId_idx" ON "MindMapEdge"("targetNodeId");

-- CreateIndex
CREATE INDEX "MindMapEdge_sourceEntryId_idx" ON "MindMapEdge"("sourceEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "MindMapEdge_sceneId_sourceNodeId_targetNodeId_relationshipT_key" ON "MindMapEdge"("sceneId", "sourceNodeId", "targetNodeId", "relationshipType");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MindMapScene" ADD CONSTRAINT "MindMapScene_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MindMapNode" ADD CONSTRAINT "MindMapNode_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "MindMapScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MindMapNode" ADD CONSTRAINT "MindMapNode_sourceEntryId_fkey" FOREIGN KEY ("sourceEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MindMapEdge" ADD CONSTRAINT "MindMapEdge_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "MindMapScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MindMapEdge" ADD CONSTRAINT "MindMapEdge_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "MindMapNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MindMapEdge" ADD CONSTRAINT "MindMapEdge_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "MindMapNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MindMapEdge" ADD CONSTRAINT "MindMapEdge_sourceEntryId_fkey" FOREIGN KEY ("sourceEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
