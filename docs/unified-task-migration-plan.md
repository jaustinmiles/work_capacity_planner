# Unified Task Model Migration Plan

## Overview
Unify `Task` and `SequencedTask` into a single `Task` model that can optionally have steps. This will simplify the codebase and provide consistent time tracking.

## Current State

### Two Separate Models:
- **Task**: Standalone tasks with basic properties
- **SequencedTask**: Workflows with multiple `TaskStep` children
- **Different time tracking**: `WorkSession` for regular tasks, `StepWorkSession` for workflow steps
- **Duplicated fields**: Both have importance, urgency, type, etc.

## Proposed Unified Model

```prisma
model Task {
  id              String   @id @default(uuid())
  name            String
  duration        Int      // total duration (sum of steps if has steps)
  importance      Int
  urgency         Int
  type            String   // "focused" | "admin"
  asyncWaitTime   Int      @default(0)
  dependencies    String   @default("[]") // JSON array of task IDs
  completed       Boolean  @default(false)
  completedAt     DateTime?
  actualDuration  Int?     // total actual duration
  notes           String?
  projectId       String?
  deadline        DateTime?
  sessionId       String
  
  // New fields for workflow support
  hasSteps        Boolean  @default(false)
  currentStepId   String?  // Currently active step
  overallStatus   String   @default("not_started") // for workflows
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  session         Session  @relation(fields: [sessionId], references: [id])
  project         Project? @relation(fields: [projectId], references: [id])
  steps           TaskStep[]
  workSessions    WorkSession[] // All time tracking in one place
}

model TaskStep {
  id              String   @id @default(uuid())
  taskId          String   // Changed from sequencedTaskId
  name            String
  duration        Int
  type            String
  dependsOn       String   @default("[]")
  asyncWaitTime   Int      @default(0)
  status          String   @default("pending")
  stepIndex       Int
  
  // Progress tracking
  actualDuration  Int?
  startedAt       DateTime?
  completedAt     DateTime?
  percentComplete Int      @default(0)
  
  task            Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  
  @@index([taskId, stepIndex])
}

model WorkSession {
  id              String   @id @default(uuid())
  taskId          String
  stepId          String?  // Optional - if tracking step time
  type            String   // "focused" | "admin"
  startTime       DateTime
  endTime         DateTime?
  duration        Int      // minutes
  notes           String?
  createdAt       DateTime @default(now())
  
  task            Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  
  @@index([taskId])
  @@index([startTime])
}
```

## Migration Steps

### Phase 1: Database Migration
1. Create backup before starting
2. Add new fields to Task model
3. Create migration script to:
   - Copy all SequencedTask data to Task table
   - Update TaskStep foreign keys to point to Task
   - Merge StepWorkSession into WorkSession
   - Update all related queries

### Phase 2: Code Updates
1. Update types in `@shared/types.ts`
2. Update database service methods
3. Update Zustand store
4. Update components to use unified model
5. Remove old SequencedTask references

### Phase 3: Testing & Validation
1. Test data migration thoroughly
2. Verify all existing features work
3. Check time tracking accumulation
4. Test import/export if applicable

## Benefits
1. **Simplified mental model**: One task type that can have steps
2. **Unified time tracking**: All time logs in one table
3. **Easier queries**: No need to join multiple tables
4. **Better maintainability**: Less duplicate code
5. **Consistent UI**: Same components for all tasks

## Risks & Mitigations
1. **Data loss**: Mitigated by comprehensive backup system
2. **Breaking changes**: Careful migration script with validation
3. **UI confusion**: Clear migration messages and testing

## Rollback Plan
1. Restore from backup using `npm run db:restore`
2. Revert code changes from git
3. Document any issues for retry