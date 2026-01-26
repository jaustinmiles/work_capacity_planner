-- CreateTable
CREATE TABLE "ScheduleSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "label" TEXT,
    "snapshotData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScheduleSnapshot_sessionId_idx" ON "ScheduleSnapshot"("sessionId");

-- CreateIndex
CREATE INDEX "ScheduleSnapshot_createdAt_idx" ON "ScheduleSnapshot"("createdAt");
