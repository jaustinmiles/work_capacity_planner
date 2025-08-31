# Amendment Applicator Analysis

## Current Capabilities ✅

### 1. Status Updates
- ✅ Update task completion status
- ✅ Update workflow overall status  
- ✅ Update individual workflow step status
- **Supported statuses**: not_started, in_progress, waiting, completed

### 2. Time Logging
- ✅ Log time to tasks
- ✅ Log time to workflow steps (COMPLETED 2025-08-31)
- Creates WorkSession records with date, planned/actual minutes

### 3. Note Addition
- ✅ Add/append notes to tasks
- ✅ Add/append notes to workflows
- ✅ Add notes to workflow steps (COMPLETED 2025-08-31)

### 4. Duration Changes
- ✅ Change task duration
- ✅ Change workflow overall duration
- ✅ Change individual step duration (COMPLETED 2025-08-31)

### 5. Step Management
- ✅ Add new steps to workflows
  - With name, duration, type
  - Position (after/before specific step)
  - Dependencies
  - Async wait time
- ✅ Remove steps from workflows (Already implemented, verified 2025-08-31)

### 6. Dependency Management
- ✅ Add/remove dependencies for tasks
- ✅ Add/remove dependencies for workflows
- ✅ Add/remove dependencies for workflow steps

### 7. Creation
- ✅ Create new tasks with:
  - Name, description, duration
  - Importance, urgency
  - Task type
- ✅ Create new workflows with:
  - Name, description
  - Multiple steps with dependencies
  - Importance, urgency

## UI Edit Capabilities (Added 2025-08-31) ✅

### Amendment Edit UI in VoiceAmendmentModal
Users can now edit amendments before applying them:

1. **PriorityChange** - Edit UI added
   - Importance slider & input (1-10)
   - Urgency slider & input (1-10)
   - Cognitive complexity slider & input (1-5) when applicable

2. **TypeChange** - Edit UI added
   - Dropdown to select task type (Focused/Admin/Personal)

3. **DependencyChange** - Edit UI added
   - Multi-select for adding dependencies
   - Multi-select for removing dependencies

4. **DeadlineChange** - Already had UI
   - DatePicker for deadline
   - Dropdown for deadline type (soft/hard)

5. **Other existing edit UIs**:
   - Duration inputs for TimeLog, DurationChange, StepAddition
   - Text areas for notes and descriptions
   - Status dropdowns
   - Task creation priority/type controls

## Missing Capabilities ❌

### Remaining Gaps

1. **Cognitive Complexity for Tasks** ⚠️
   - Can set for steps via PriorityChange
   - Cannot set for regular tasks (only importance/urgency)
   - Would need separate amendment or extend PriorityChange

2. **Async Properties** ❌
   - Cannot modify asyncWaitTime
   - Cannot change isAsyncTrigger flag
   - Cannot update expectedResponseTime

3. **Project/Context** ❌
   - Cannot assign/change projectId
   - Cannot group tasks into projects

4. **Locking/Scheduling** ❌
   - Cannot lock task to specific time
   - Cannot set lockedStartTime
   - Cannot mark task as locked/unlocked

5. **Bulk Operations** ❌
    - Cannot mark multiple steps complete
    - Cannot update multiple attributes at once

## Amendment Parser Limitations

### What AI Can Detect
The AI parser (Claude) can identify:
- Status changes
- Time logging
- Note additions
- Duration changes  
- Step additions/removals
- Dependency changes
- Task/workflow creation

### What AI Cannot Currently Handle
- Deadline setting/changes
- Priority/importance/urgency updates
- Cognitive complexity settings
- Task type changes
- Project assignments
- Scheduling locks
- Bulk operations

## Recommended Enhancements

### Priority 1: Core Attributes
1. **Add DeadlineChange amendment type**
   ```typescript
   interface DeadlineChange {
     type: AmendmentType.DeadlineChange
     target: AmendmentTarget
     newDeadline: Date
     deadlineType?: 'hard' | 'soft'
   }
   ```

2. **Add PriorityChange amendment type**
   ```typescript
   interface PriorityChange {
     type: AmendmentType.PriorityChange
     target: AmendmentTarget
     importance?: number
     urgency?: number
     cognitiveComplexity?: 1 | 2 | 3 | 4 | 5
   }
   ```

3. **Add TypeChange amendment type**
   ```typescript
   interface TypeChange {
     type: AmendmentType.TypeChange
     target: AmendmentTarget
     newType: TaskType
     stepName?: string // For changing step types
   }
   ```

### Priority 2: Complete Existing
4. **Implement StepRemoval**
   - Already defined but not implemented
   - Critical for workflow editing

5. **Complete step-level operations**
   - Step duration changes
   - Step notes
   - Step time logging

### Priority 3: Advanced Features
6. **Add BulkUpdate amendment type**
   ```typescript
   interface BulkUpdate {
     type: AmendmentType.BulkUpdate
     targets: AmendmentTarget[]
     updates: Partial<Task | TaskStep>
   }
   ```

7. **Add ProjectAssignment amendment type**
   ```typescript
   interface ProjectAssignment {
     type: AmendmentType.ProjectAssignment
     targets: AmendmentTarget[]
     projectId: string
   }
   ```

8. **Add SchedulingLock amendment type**
   ```typescript
   interface SchedulingLock {
     type: AmendmentType.SchedulingLock
     target: AmendmentTarget
     locked: boolean
     lockedStartTime?: Date
   }
   ```

## Implementation Priority

1. **Immediate** (blocks common use cases):
   - DeadlineChange
   - PriorityChange (importance/urgency)
   - StepRemoval implementation

2. **Soon** (improves usability):
   - TypeChange
   - Step-level duration/notes
   - Cognitive complexity updates

3. **Future** (nice to have):
   - Bulk operations
   - Project management
   - Scheduling locks
   - Advanced async properties

## Summary (Updated 2025-08-31)

The amendment applicator now handles **~85% of possible task/workflow modifications**:

### ✅ Fully Implemented
- All status updates (tasks, workflows, steps)
- All time logging (tasks, workflows, steps)
- All note additions (tasks, workflows, steps)
- All duration changes (tasks, workflows, steps)
- Step management (add, remove, dependencies)
- Task/workflow creation
- Deadline management (tasks, workflows)
- Priority/importance/urgency changes
- Task type changes
- Dependency management

### ✅ Edit UI Implemented
- Priority changes (importance, urgency, cognitive complexity)
- Type changes (task type selection)
- Dependency changes (add/remove)
- Deadline changes (date and type)
- Duration, notes, status edits
- Task creation parameters

### ❌ Remaining Gaps
- Async properties (wait times, triggers)
- Project/context assignment
- Scheduling locks
- Bulk operations
- Cognitive complexity for regular tasks

The voice amendment feature is now significantly more capable, allowing users to modify most task and workflow attributes through voice commands with visual editing before application.