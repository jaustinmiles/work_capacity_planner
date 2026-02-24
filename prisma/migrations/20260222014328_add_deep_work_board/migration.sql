-- CreateTable
CREATE TABLE "public"."DeepWorkBoard" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoom" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "panX" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "panY" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "actionPanelOpen" BOOLEAN NOT NULL DEFAULT true,
    "actionPanelWidth" INTEGER NOT NULL DEFAULT 320,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeepWorkBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeepWorkNode" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "taskId" TEXT,
    "stepId" TEXT,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 220,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeepWorkNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeepWorkBoard_sessionId_idx" ON "public"."DeepWorkBoard"("sessionId");

-- CreateIndex
CREATE INDEX "DeepWorkNode_boardId_idx" ON "public"."DeepWorkNode"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "DeepWorkNode_boardId_taskId_key" ON "public"."DeepWorkNode"("boardId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "DeepWorkNode_boardId_stepId_key" ON "public"."DeepWorkNode"("boardId", "stepId");

-- AddForeignKey
ALTER TABLE "public"."DeepWorkBoard" ADD CONSTRAINT "DeepWorkBoard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeepWorkNode" ADD CONSTRAINT "DeepWorkNode_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."DeepWorkBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
