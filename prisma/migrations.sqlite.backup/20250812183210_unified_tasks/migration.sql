-- CreateIndex
DROP INDEX IF EXISTS "TaskStep_sequencedTaskId_idx";

-- AlterTable - Add new columns to Task
ALTER TABLE "Task" ADD COLUMN "hasSteps" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "currentStepId" TEXT;
ALTER TABLE "Task" ADD COLUMN "overallStatus" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "Task" ADD COLUMN "criticalPathDuration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "worstCaseDuration" INTEGER NOT NULL DEFAULT 0;

-- Update existing tasks
UPDATE "Task" SET 
  "hasSteps" = false,
  "overallStatus" = CASE WHEN "completed" = 1 THEN 'completed' ELSE 'not_started' END,
  "criticalPathDuration" = "duration",
  "worstCaseDuration" = "duration";

-- AlterTable - Add new columns to TaskStep before migration
ALTER TABLE "TaskStep" ADD COLUMN "taskId" TEXT;

-- Migrate SequencedTask data to Task
INSERT INTO "Task" (
  "id", "name", "duration", "importance", "urgency", "type", "asyncWaitTime", 
  "dependencies", "completed", "completedAt", "actualDuration", "notes", 
  "projectId", "deadline", "sessionId", "hasSteps", "currentStepId", 
  "overallStatus", "criticalPathDuration", "worstCaseDuration", 
  "createdAt", "updatedAt"
)
SELECT 
  'migrated-' || "id",
  "name",
  "totalDuration",
  "importance",
  "urgency",
  "type",
  0,
  "dependencies",
  "completed",
  CASE WHEN "completed" = 1 THEN datetime('now') ELSE NULL END,
  NULL,
  "notes",
  NULL,
  NULL,
  "sessionId",
  true,
  NULL,
  "overallStatus",
  "criticalPathDuration",
  "worstCaseDuration",
  "createdAt",
  "updatedAt"
FROM "SequencedTask";

-- Update TaskStep taskId references
UPDATE "TaskStep" 
SET "taskId" = 'migrated-' || "sequencedTaskId";

-- Calculate actual duration for migrated workflows
UPDATE "Task" 
SET "actualDuration" = (
  SELECT SUM(COALESCE("actualDuration", 0))
  FROM "TaskStep"
  WHERE "TaskStep"."taskId" = "Task"."id"
)
WHERE "hasSteps" = true AND "id" LIKE 'migrated-%';

-- Update currentStepId for in-progress workflows
UPDATE "Task" 
SET "currentStepId" = (
  SELECT "id" FROM "TaskStep" 
  WHERE "TaskStep"."taskId" = "Task"."id" 
  AND "TaskStep"."status" = 'in_progress'
  LIMIT 1
)
WHERE "hasSteps" = true;

-- stepId already exists in WorkSession, no need to add it

-- Migrate StepWorkSession to WorkSession
INSERT INTO "WorkSession" (
  "id", "taskId", "stepId", "patternId", "type", "startTime", "endTime", 
  "plannedMinutes", "actualMinutes", "notes", "createdAt"
)
SELECT 
  'step-' || "sws"."id",
  "ts"."taskId",
  "sws"."taskStepId",
  NULL,
  "ts"."type",
  "sws"."startTime",
  "sws"."endTime",
  "sws"."duration",
  "sws"."duration",
  "sws"."notes",
  "sws"."createdAt"
FROM "StepWorkSession" "sws"
JOIN "TaskStep" "ts" ON "ts"."id" = "sws"."taskStepId"
WHERE "ts"."taskId" IS NOT NULL;

-- Make taskId required after migration
-- First ensure all TaskSteps have taskId
UPDATE "TaskStep" SET "taskId" = "taskId" WHERE "taskId" IS NOT NULL;

-- Create new TaskStep table with correct schema
CREATE TABLE "TaskStep_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "duration" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "dependsOn" TEXT NOT NULL DEFAULT '[]',
  "asyncWaitTime" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "stepIndex" INTEGER NOT NULL,
  "actualDuration" INTEGER,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "percentComplete" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy data to new table
INSERT INTO "TaskStep_new" SELECT "id", "taskId", "name", "duration", "type", "dependsOn", "asyncWaitTime", "status", "stepIndex", "actualDuration", "startedAt", "completedAt", "percentComplete" FROM "TaskStep" WHERE "taskId" IS NOT NULL;

-- Drop old table and rename new one
DROP TABLE "TaskStep";
ALTER TABLE "TaskStep_new" RENAME TO "TaskStep";

-- Drop old tables
DROP TABLE "StepWorkSession";
DROP TABLE "SequencedTask";

-- CreateIndex
CREATE INDEX "TaskStep_taskId_stepIndex_idx" ON "TaskStep"("taskId", "stepIndex");