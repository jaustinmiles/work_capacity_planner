-- AlterTable
ALTER TABLE "SequencedTask" ADD COLUMN "deadline" DATETIME;
ALTER TABLE "SequencedTask" ADD COLUMN "deadlineType" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "cognitiveComplexity" INTEGER;
ALTER TABLE "Task" ADD COLUMN "deadlineType" TEXT;

-- CreateTable
CREATE TABLE "ProductivityPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "timeRangeStart" TEXT NOT NULL,
    "timeRangeEnd" TEXT NOT NULL,
    "cognitiveCapacity" TEXT NOT NULL,
    "preferredComplexity" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductivityPattern_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchedulingPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "allowWeekendWork" BOOLEAN NOT NULL DEFAULT false,
    "weekendPenalty" REAL NOT NULL DEFAULT 0.5,
    "contextSwitchPenalty" INTEGER NOT NULL DEFAULT 15,
    "asyncParallelizationBonus" INTEGER NOT NULL DEFAULT 20,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchedulingPreferences_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "dependsOn" TEXT NOT NULL DEFAULT '[]',
    "asyncWaitTime" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sequencedTaskId" TEXT,
    "stepIndex" INTEGER NOT NULL,
    "taskId" TEXT NOT NULL,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "actualDuration" INTEGER,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "notes" TEXT,
    "cognitiveComplexity" INTEGER,
    "isAsyncTrigger" BOOLEAN NOT NULL DEFAULT false,
    "expectedResponseTime" INTEGER,
    CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskStep_sequencedTaskId_fkey" FOREIGN KEY ("sequencedTaskId") REFERENCES "SequencedTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskStep" ("actualDuration", "asyncWaitTime", "completedAt", "dependsOn", "duration", "id", "name", "notes", "percentComplete", "sequencedTaskId", "startedAt", "status", "stepIndex", "taskId", "type") SELECT "actualDuration", "asyncWaitTime", "completedAt", "dependsOn", "duration", "id", "name", "notes", "percentComplete", "sequencedTaskId", "startedAt", "status", "stepIndex", "taskId", "type" FROM "TaskStep";
DROP TABLE "TaskStep";
ALTER TABLE "new_TaskStep" RENAME TO "TaskStep";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductivityPattern_sessionId_idx" ON "ProductivityPattern"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingPreferences_sessionId_key" ON "SchedulingPreferences"("sessionId");
