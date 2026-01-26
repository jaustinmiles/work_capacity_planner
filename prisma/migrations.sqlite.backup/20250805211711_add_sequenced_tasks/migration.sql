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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaskStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "dependsOn" TEXT NOT NULL DEFAULT '[]',
    "asyncWaitTime" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sequencedTaskId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    CONSTRAINT "TaskStep_sequencedTaskId_fkey" FOREIGN KEY ("sequencedTaskId") REFERENCES "SequencedTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
