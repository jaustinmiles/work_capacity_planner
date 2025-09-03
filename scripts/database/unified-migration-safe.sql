-- Safe Unified Task Model Migration
-- This approach uses temporary tables to avoid foreign key issues

PRAGMA foreign_keys=OFF;

-- 1. Create temporary unified task table
CREATE TABLE "Task_New" (
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
  "hasSteps" BOOLEAN NOT NULL DEFAULT false,
  "currentStepId" TEXT,
  "overallStatus" TEXT NOT NULL DEFAULT 'not_started',
  "criticalPathDuration" INTEGER NOT NULL DEFAULT 0,
  "worstCaseDuration" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Task_New_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Task_New_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 2. Copy existing tasks
INSERT INTO "Task_New" 
SELECT 
  id, name, duration, importance, urgency, type, asyncWaitTime,
  dependencies, completed, completedAt, actualDuration, notes,
  projectId, deadline, sessionId,
  false, -- hasSteps
  NULL, -- currentStepId
  CASE WHEN completed = 1 THEN 'completed' ELSE 'not_started' END, -- overallStatus
  duration, -- criticalPathDuration
  duration, -- worstCaseDuration
  createdAt, updatedAt
FROM "Task";

-- 3. Copy sequenced tasks
INSERT INTO "Task_New" (
  id, name, duration, importance, urgency, type, asyncWaitTime,
  dependencies, completed, completedAt, actualDuration, notes,
  projectId, deadline, sessionId, hasSteps, currentStepId,
  overallStatus, criticalPathDuration, worstCaseDuration,
  createdAt, updatedAt
)
SELECT 
  'migrated-' || id,
  name,
  totalDuration,
  importance,
  urgency,
  type,
  0,
  dependencies,
  completed,
  CASE WHEN completed = 1 THEN datetime('now') ELSE NULL END,
  NULL,
  notes,
  NULL,
  NULL,
  sessionId,
  true,
  NULL,
  overallStatus,
  criticalPathDuration,
  worstCaseDuration,
  createdAt,
  updatedAt
FROM "SequencedTask";

-- 4. Create new TaskStep table
CREATE TABLE "TaskStep_New" (
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
  CONSTRAINT "TaskStep_New_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task_New" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Copy task steps with new taskId
INSERT INTO "TaskStep_New"
SELECT 
  id,
  'migrated-' || sequencedTaskId,
  name,
  duration,
  type,
  dependsOn,
  asyncWaitTime,
  status,
  stepIndex,
  actualDuration,
  startedAt,
  completedAt,
  percentComplete
FROM "TaskStep";

-- 6. Update actual duration for workflows
UPDATE "Task_New" 
SET actualDuration = (
  SELECT SUM(COALESCE(actualDuration, 0))
  FROM "TaskStep_New"
  WHERE "TaskStep_New"."taskId" = "Task_New"."id"
)
WHERE hasSteps = true;

-- 7. Update currentStepId
UPDATE "Task_New"
SET currentStepId = (
  SELECT id FROM "TaskStep_New"
  WHERE "TaskStep_New"."taskId" = "Task_New"."id"
  AND "TaskStep_New"."status" = 'in_progress'
  LIMIT 1
)
WHERE hasSteps = true;

-- 8. Create new WorkSession table
CREATE TABLE "WorkSession_New" (
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
  CONSTRAINT "WorkSession_New_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task_New" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkSession_New_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 9. Copy existing work sessions (if any have taskId)
INSERT INTO "WorkSession_New"
SELECT 
  id,
  taskId,
  stepId,
  patternId,
  type,
  startTime,
  endTime,
  plannedMinutes,
  actualMinutes,
  notes,
  createdAt
FROM "WorkSession"
WHERE taskId IS NOT NULL;

-- 10. Convert step work sessions
INSERT INTO "WorkSession_New" (
  id, taskId, stepId, patternId, type, startTime, endTime,
  plannedMinutes, actualMinutes, notes, createdAt
)
SELECT 
  'step-' || sws.id,
  ts.taskId,
  sws.taskStepId,
  NULL,
  ts.type,
  sws.startTime,
  sws.endTime,
  sws.duration,
  sws.duration,
  sws.notes,
  sws.createdAt
FROM "StepWorkSession" sws
JOIN "TaskStep_New" ts ON ts.id = sws.taskStepId;

-- 11. Drop old tables and rename new ones
DROP TABLE "ScheduledTask";
DROP TABLE "StepWorkSession";
DROP TABLE "TaskStep";
DROP TABLE "Task";
DROP TABLE "SequencedTask";
DROP TABLE "WorkSession";

ALTER TABLE "Task_New" RENAME TO "Task";
ALTER TABLE "TaskStep_New" RENAME TO "TaskStep";
ALTER TABLE "WorkSession_New" RENAME TO "WorkSession";

-- 12. Create new ScheduledTask table
CREATE TABLE "ScheduledTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "scheduledDate" DATETIME NOT NULL,
  "scheduledMinutes" INTEGER NOT NULL,
  "isPartial" BOOLEAN NOT NULL,
  "isStart" BOOLEAN NOT NULL,
  "isEnd" BOOLEAN NOT NULL,
  "sessionId" TEXT NOT NULL,
  CONSTRAINT "ScheduledTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScheduledTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 13. Create indexes
CREATE INDEX "Task_hasSteps_idx" ON "Task"("hasSteps");
CREATE INDEX "TaskStep_taskId_stepIndex_idx" ON "TaskStep"("taskId", "stepIndex");
CREATE INDEX "WorkSession_taskId_idx" ON "WorkSession"("taskId");
CREATE INDEX "WorkSession_startTime_idx" ON "WorkSession"("startTime");

PRAGMA foreign_keys=ON;