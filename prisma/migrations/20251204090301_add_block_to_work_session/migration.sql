/*
  Warnings:

  - You are about to drop the column `splitRatio` on the `WorkBlock` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `WorkBlock` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "UserTaskType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserTaskType_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeSink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "typeId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeSink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeSinkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timeSinkId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "actualMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeSinkSession_timeSinkId_fkey" FOREIGN KEY ("timeSinkId") REFERENCES "TimeSink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patternId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "typeConfig" TEXT NOT NULL DEFAULT '{"kind":"system","systemType":"blocked"}',
    "totalCapacity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WorkBlock_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkBlock" ("endTime", "id", "patternId", "startTime", "totalCapacity") SELECT "endTime", "id", "patternId", "startTime", "totalCapacity" FROM "WorkBlock";
DROP TABLE "WorkBlock";
ALTER TABLE "new_WorkBlock" RENAME TO "WorkBlock";
CREATE INDEX "WorkBlock_patternId_idx" ON "WorkBlock"("patternId");
CREATE TABLE "new_WorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "stepId" TEXT,
    "patternId" TEXT,
    "blockId" TEXT,
    "type" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "actualMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkSession_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkSession_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "WorkBlock" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkSession" ("actualMinutes", "createdAt", "endTime", "id", "notes", "patternId", "plannedMinutes", "startTime", "stepId", "taskId", "type") SELECT "actualMinutes", "createdAt", "endTime", "id", "notes", "patternId", "plannedMinutes", "startTime", "stepId", "taskId", "type" FROM "WorkSession";
DROP TABLE "WorkSession";
ALTER TABLE "new_WorkSession" RENAME TO "WorkSession";
CREATE INDEX "WorkSession_startTime_idx" ON "WorkSession"("startTime");
CREATE INDEX "WorkSession_taskId_idx" ON "WorkSession"("taskId");
CREATE INDEX "WorkSession_blockId_idx" ON "WorkSession"("blockId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UserTaskType_sessionId_idx" ON "UserTaskType"("sessionId");

-- CreateIndex
CREATE INDEX "TimeSink_sessionId_idx" ON "TimeSink"("sessionId");

-- CreateIndex
CREATE INDEX "TimeSinkSession_timeSinkId_idx" ON "TimeSinkSession"("timeSinkId");

-- CreateIndex
CREATE INDEX "TimeSinkSession_startTime_idx" ON "TimeSinkSession"("startTime");
