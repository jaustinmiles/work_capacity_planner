-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "error" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LogMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processType" TEXT NOT NULL,
    "memoryUsage" TEXT NOT NULL,
    "cpuUsage" REAL NOT NULL,
    "logCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ErrorLog_level_idx" ON "ErrorLog"("level");

-- CreateIndex
CREATE INDEX "ErrorLog_sessionId_idx" ON "ErrorLog"("sessionId");

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "LogMetric_processType_idx" ON "LogMetric"("processType");

-- CreateIndex
CREATE INDEX "LogMetric_createdAt_idx" ON "LogMetric"("createdAt");
