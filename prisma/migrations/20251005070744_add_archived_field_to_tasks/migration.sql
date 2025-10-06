-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "importance" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'work',
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
    "deadlineType" TEXT,
    "cognitiveComplexity" INTEGER,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedStartTime" DATETIME,
    "hasSteps" BOOLEAN NOT NULL DEFAULT false,
    "currentStepId" TEXT,
    "overallStatus" TEXT NOT NULL DEFAULT 'not_started',
    "criticalPathDuration" INTEGER NOT NULL DEFAULT 0,
    "worstCaseDuration" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_Task" ("actualDuration", "asyncWaitTime", "category", "cognitiveComplexity", "completed", "completedAt", "createdAt", "criticalPathDuration", "currentStepId", "deadline", "deadlineType", "dependencies", "duration", "hasSteps", "id", "importance", "isLocked", "lockedStartTime", "name", "notes", "overallStatus", "projectId", "sessionId", "type", "updatedAt", "urgency", "worstCaseDuration") SELECT "actualDuration", "asyncWaitTime", "category", "cognitiveComplexity", "completed", "completedAt", "createdAt", "criticalPathDuration", "currentStepId", "deadline", "deadlineType", "dependencies", "duration", "hasSteps", "id", "importance", "isLocked", "lockedStartTime", "name", "notes", "overallStatus", "projectId", "sessionId", "type", "updatedAt", "urgency", "worstCaseDuration" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
