-- Unified Task Model Migration SQL
-- This script migrates data from the old schema to the new unified schema

-- 1. Add new columns to Task table
ALTER TABLE Task ADD COLUMN hasSteps BOOLEAN DEFAULT FALSE;
ALTER TABLE Task ADD COLUMN currentStepId TEXT;
ALTER TABLE Task ADD COLUMN overallStatus TEXT DEFAULT 'not_started';
ALTER TABLE Task ADD COLUMN criticalPathDuration INTEGER DEFAULT 0;
ALTER TABLE Task ADD COLUMN worstCaseDuration INTEGER DEFAULT 0;

-- 2. Update existing tasks with default values
UPDATE Task SET 
  hasSteps = FALSE,
  overallStatus = CASE WHEN completed = 1 THEN 'completed' ELSE 'not_started' END,
  criticalPathDuration = duration,
  worstCaseDuration = duration;

-- 3. Migrate SequencedTask data to Task table
INSERT INTO Task (
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
  0, -- asyncWaitTime
  dependencies,
  completed,
  CASE WHEN completed = 1 THEN datetime('now') ELSE NULL END,
  NULL, -- actualDuration will be calculated later
  notes,
  NULL, -- projectId
  NULL, -- deadline
  sessionId,
  1, -- hasSteps = true
  NULL, -- currentStepId will be updated later
  overallStatus,
  criticalPathDuration,
  worstCaseDuration,
  createdAt,
  updatedAt
FROM SequencedTask;

-- 4. Update TaskStep to reference new Task IDs
-- First, add new taskId column
ALTER TABLE TaskStep ADD COLUMN taskId TEXT;

-- Update taskId with migrated IDs
UPDATE TaskStep 
SET taskId = 'migrated-' || sequencedTaskId;

-- 5. Calculate actual duration for migrated tasks
UPDATE Task 
SET actualDuration = (
  SELECT SUM(COALESCE(actualDuration, 0))
  FROM TaskStep
  WHERE TaskStep.taskId = Task.id
)
WHERE hasSteps = 1 AND id LIKE 'migrated-%';

-- 6. Update currentStepId for in-progress workflows
UPDATE Task 
SET currentStepId = (
  SELECT id FROM TaskStep 
  WHERE TaskStep.taskId = Task.id 
  AND TaskStep.status = 'in_progress'
  LIMIT 1
)
WHERE hasSteps = 1;

-- 7. Migrate StepWorkSession to WorkSession
-- First add columns to WorkSession
ALTER TABLE WorkSession ADD COLUMN stepId TEXT;

-- Insert step work sessions
INSERT INTO WorkSession (
  id, taskId, stepId, patternId, type, startTime, endTime, 
  plannedMinutes, actualMinutes, notes, createdAt
)
SELECT 
  'step-' || sws.id,
  ts.taskId,
  sws.taskStepId,
  NULL, -- patternId
  ts.type,
  sws.startTime,
  sws.endTime,
  sws.duration,
  sws.duration,
  sws.notes,
  sws.createdAt
FROM StepWorkSession sws
JOIN TaskStep ts ON ts.id = sws.taskStepId
WHERE ts.taskId IS NOT NULL;

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_has_steps ON Task(hasSteps);
CREATE INDEX IF NOT EXISTS idx_work_session_step_id ON WorkSession(stepId);

-- 9. Drop old columns and tables (commented out for safety - run manually after verification)
-- DROP TABLE StepWorkSession;
-- DROP TABLE SequencedTask;
-- ALTER TABLE TaskStep DROP COLUMN sequencedTaskId;