/*
  Warnings:

  - You are about to drop the column `sessionId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `sessionId` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `sequencedTaskId` on the `WorkSession` table. All the data in the column will be lost.
  - Made the column `taskId` on table `WorkSession` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateTable
CREATE TABLE "SequencedTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "importance" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "dependencies" TEXT NOT NULL DEFAULT '[]',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "totalDuration" INTEGER NOT NULL,
    "criticalPathDuration" INTEGER NOT NULL,
    "worstCaseDuration" INTEGER NOT NULL,
    "overallStatus" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sessionId" TEXT,
    CONSTRAINT "SequencedTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JargonEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "category" TEXT,
    "examples" TEXT,
    "relatedTerms" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JargonEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_JargonEntry" ("category", "createdAt", "definition", "examples", "id", "relatedTerms", "sessionId", "term", "updatedAt") SELECT "category", "createdAt", "definition", "examples", "id", "relatedTerms", "sessionId", "term", "updatedAt" FROM "JargonEntry";
DROP TABLE "JargonEntry";
ALTER TABLE "new_JargonEntry" RENAME TO "JargonEntry";
CREATE UNIQUE INDEX "JargonEntry_sessionId_term_key" ON "JargonEntry"("sessionId", "term");
CREATE TABLE "new_JobContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "asyncPatterns" TEXT NOT NULL,
    "reviewCycles" TEXT NOT NULL,
    "tools" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobContext_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_JobContext" ("asyncPatterns", "context", "createdAt", "description", "id", "isActive", "name", "reviewCycles", "sessionId", "tools", "updatedAt") SELECT "asyncPatterns", "context", "createdAt", "description", "id", "isActive", "name", "reviewCycles", "sessionId", "tools", "updatedAt" FROM "JobContext";
DROP TABLE "JobContext";
ALTER TABLE "new_JobContext" RENAME TO "JobContext";
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Project" ("color", "createdAt", "id", "name") SELECT "color", "createdAt", "id", "name" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE TABLE "new_ScheduledTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "scheduledDate" DATETIME NOT NULL,
    "scheduledMinutes" INTEGER NOT NULL,
    "isPartial" BOOLEAN NOT NULL,
    "isStart" BOOLEAN NOT NULL,
    "isEnd" BOOLEAN NOT NULL,
    CONSTRAINT "ScheduledTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ScheduledTask" ("id", "isEnd", "isPartial", "isStart", "scheduledDate", "scheduledMinutes", "taskId") SELECT "id", "isEnd", "isPartial", "isStart", "scheduledDate", "scheduledMinutes", "taskId" FROM "ScheduledTask";
DROP TABLE "ScheduledTask";
ALTER TABLE "new_ScheduledTask" RENAME TO "ScheduledTask";
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Session" ("createdAt", "description", "id", "isActive", "name", "updatedAt") SELECT "createdAt", "description", "id", "isActive", "name", "updatedAt" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "importance" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "asyncWaitTime" INTEGER NOT NULL DEFAULT 0,
    "dependencies" TEXT NOT NULL DEFAULT '[]',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "actualDuration" INTEGER,
    "notes" TEXT,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sessionId" TEXT,
    "deadline" DATETIME,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedStartTime" DATETIME,
    "hasSteps" BOOLEAN NOT NULL DEFAULT false,
    "currentStepId" TEXT,
    "overallStatus" TEXT NOT NULL DEFAULT 'not_started',
    "criticalPathDuration" INTEGER NOT NULL DEFAULT 0,
    "worstCaseDuration" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_Task" ("actualDuration", "asyncWaitTime", "completed", "completedAt", "createdAt", "criticalPathDuration", "currentStepId", "deadline", "dependencies", "duration", "hasSteps", "id", "importance", "name", "notes", "overallStatus", "projectId", "sessionId", "type", "updatedAt", "urgency", "worstCaseDuration") SELECT "actualDuration", "asyncWaitTime", "completed", "completedAt", "createdAt", "criticalPathDuration", "currentStepId", "deadline", "dependencies", "duration", "hasSteps", "id", "importance", "name", "notes", "overallStatus", "projectId", "sessionId", "type", "updatedAt", "urgency", "worstCaseDuration" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
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
    CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskStep_sequencedTaskId_fkey" FOREIGN KEY ("sequencedTaskId") REFERENCES "SequencedTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskStep" ("actualDuration", "asyncWaitTime", "completedAt", "dependsOn", "duration", "id", "name", "percentComplete", "startedAt", "status", "stepIndex", "taskId", "type") SELECT "actualDuration", "asyncWaitTime", "completedAt", "dependsOn", "duration", "id", "name", "percentComplete", "startedAt", "status", "stepIndex", "taskId", "type" FROM "TaskStep";
DROP TABLE "TaskStep";
ALTER TABLE "new_TaskStep" RENAME TO "TaskStep";
CREATE TABLE "new_WorkPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateName" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkPattern_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_WorkPattern" ("createdAt", "date", "id", "isTemplate", "sessionId", "templateName", "updatedAt") SELECT "createdAt", "date", "id", "isTemplate", "sessionId", "templateName", "updatedAt" FROM "WorkPattern";
DROP TABLE "WorkPattern";
ALTER TABLE "new_WorkPattern" RENAME TO "WorkPattern";
CREATE UNIQUE INDEX "WorkPattern_sessionId_date_key" ON "WorkPattern"("sessionId", "date");
CREATE TABLE "new_WorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "stepId" TEXT,
    "patternId" TEXT,
    "type" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "actualMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkSession_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkSession" ("actualMinutes", "createdAt", "endTime", "id", "notes", "patternId", "plannedMinutes", "startTime", "stepId", "taskId", "type") SELECT "actualMinutes", "createdAt", "endTime", "id", "notes", "patternId", "plannedMinutes", "startTime", "stepId", "taskId", "type" FROM "WorkSession";
DROP TABLE "WorkSession";
ALTER TABLE "new_WorkSession" RENAME TO "WorkSession";
CREATE INDEX "WorkSession_startTime_idx" ON "WorkSession"("startTime");
CREATE INDEX "WorkSession_taskId_idx" ON "WorkSession"("taskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
