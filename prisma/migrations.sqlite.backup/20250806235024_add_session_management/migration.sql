-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Create a default session for existing data
INSERT INTO "Session" ("id", "name", "description", "isActive", "updatedAt") 
VALUES ('default-session', 'Default Session', 'Initial session for existing data', true, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- JargonEntry
CREATE TABLE "new_JargonEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "category" TEXT,
    "examples" TEXT,
    "relatedTerms" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JargonEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_JargonEntry" ("category", "createdAt", "definition", "examples", "id", "relatedTerms", "term", "updatedAt", "sessionId") 
SELECT "category", "createdAt", "definition", "examples", "id", "relatedTerms", "term", "updatedAt", 'default-session' FROM "JargonEntry";
DROP TABLE "JargonEntry";
ALTER TABLE "new_JargonEntry" RENAME TO "JargonEntry";
CREATE UNIQUE INDEX "JargonEntry_sessionId_term_key" ON "JargonEntry"("sessionId", "term");

-- JobContext
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobContext_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_JobContext" ("asyncPatterns", "context", "createdAt", "description", "id", "isActive", "name", "reviewCycles", "tools", "updatedAt", "sessionId") 
SELECT "asyncPatterns", "context", "createdAt", "description", "id", "isActive", "name", "reviewCycles", "tools", "updatedAt", 'default-session' FROM "JobContext";
DROP TABLE "JobContext";
ALTER TABLE "new_JobContext" RENAME TO "JobContext";

-- Project
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("color", "createdAt", "id", "name", "sessionId") 
SELECT "color", "createdAt", "id", "name", 'default-session' FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";

-- Task (do this before ScheduledTask since it has FK dependency)
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
    "deadline" DATETIME,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("actualDuration", "asyncWaitTime", "completed", "completedAt", "createdAt", "deadline", "dependencies", "duration", "id", "importance", "name", "notes", "projectId", "type", "updatedAt", "urgency", "sessionId") 
SELECT "actualDuration", "asyncWaitTime", "completed", "completedAt", "createdAt", "deadline", "dependencies", "duration", "id", "importance", "name", "notes", "projectId", "type", "updatedAt", "urgency", 'default-session' FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";

-- ScheduledTask
CREATE TABLE "new_ScheduledTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "scheduledDate" DATETIME NOT NULL,
    "scheduledMinutes" INTEGER NOT NULL,
    "isPartial" BOOLEAN NOT NULL,
    "isStart" BOOLEAN NOT NULL,
    "isEnd" BOOLEAN NOT NULL,
    "sessionId" TEXT NOT NULL,
    CONSTRAINT "ScheduledTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduledTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ScheduledTask" ("id", "isEnd", "isPartial", "isStart", "scheduledDate", "scheduledMinutes", "taskId", "sessionId") 
SELECT "id", "isEnd", "isPartial", "isStart", "scheduledDate", "scheduledMinutes", "taskId", 'default-session' FROM "ScheduledTask";
DROP TABLE "ScheduledTask";
ALTER TABLE "new_ScheduledTask" RENAME TO "ScheduledTask";

-- SequencedTask
CREATE TABLE "new_SequencedTask" (
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
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SequencedTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SequencedTask" ("completed", "createdAt", "criticalPathDuration", "dependencies", "id", "importance", "name", "notes", "overallStatus", "totalDuration", "type", "updatedAt", "urgency", "worstCaseDuration", "sessionId") 
SELECT "completed", "createdAt", "criticalPathDuration", "dependencies", "id", "importance", "name", "notes", "overallStatus", "totalDuration", "type", "updatedAt", "urgency", "worstCaseDuration", 'default-session' FROM "SequencedTask";
DROP TABLE "SequencedTask";
ALTER TABLE "new_SequencedTask" RENAME TO "SequencedTask";

-- WorkPattern
CREATE TABLE "new_WorkPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateName" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkPattern_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_WorkPattern" ("createdAt", "date", "id", "isTemplate", "templateName", "updatedAt", "sessionId") 
SELECT "createdAt", "date", "id", "isTemplate", "templateName", "updatedAt", 'default-session' FROM "WorkPattern";
DROP TABLE "WorkPattern";
ALTER TABLE "new_WorkPattern" RENAME TO "WorkPattern";
CREATE UNIQUE INDEX "WorkPattern_sessionId_date_key" ON "WorkPattern"("sessionId", "date");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;