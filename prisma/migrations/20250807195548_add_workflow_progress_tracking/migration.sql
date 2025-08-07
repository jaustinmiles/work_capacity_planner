-- CreateTable
CREATE TABLE "StepWorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskStepId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "duration" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StepWorkSession_taskStepId_fkey" FOREIGN KEY ("taskStepId") REFERENCES "TaskStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeEstimateAccuracy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "workflowCategory" TEXT,
    "estimatedMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER NOT NULL,
    "variance" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeEstimateAccuracy_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "sequencedTaskId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "actualDuration" INTEGER,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TaskStep_sequencedTaskId_fkey" FOREIGN KEY ("sequencedTaskId") REFERENCES "SequencedTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskStep" ("asyncWaitTime", "dependsOn", "duration", "id", "name", "sequencedTaskId", "status", "stepIndex", "type") SELECT "asyncWaitTime", "dependsOn", "duration", "id", "name", "sequencedTaskId", "status", "stepIndex", "type" FROM "TaskStep";
DROP TABLE "TaskStep";
ALTER TABLE "new_TaskStep" RENAME TO "TaskStep";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StepWorkSession_taskStepId_idx" ON "StepWorkSession"("taskStepId");

-- CreateIndex
CREATE INDEX "TimeEstimateAccuracy_sessionId_idx" ON "TimeEstimateAccuracy"("sessionId");

-- CreateIndex
CREATE INDEX "TimeEstimateAccuracy_taskType_idx" ON "TimeEstimateAccuracy"("taskType");
