# Amendment Applicator Analysis

## Current Capabilities ✅

### 1. Status Updates
- ✅ Update task completion status
- ✅ Update workflow overall status  
- ✅ Update individual workflow step status
- **Supported statuses**: not_started, in_progress, waiting, completed

### 2. Time Logging
- ✅ Log time to tasks
- ❌ Log time to workflow steps (TODO in code)
- Creates WorkSession records with date, planned/actual minutes

### 3. Note Addition
- ✅ Add/append notes to tasks
- ✅ Add/append notes to workflows
- ❌ Add notes to workflow steps (TODO in code)

### 4. Duration Changes
- ✅ Change task duration
- ✅ Change workflow overall duration
- ❌ Change individual step duration (TODO in code)

### 5. Step Management
- ✅ Add new steps to workflows
  - With name, duration, type
  - Position (after/before specific step)
  - Dependencies
  - Async wait time
- ❌ Remove steps from workflows (TODO in code)

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

## Missing Capabilities ❌

### Critical Gaps (Your Example)
1. **Deadline Management** ❌
   - Cannot set/change task deadlines
   - Cannot set/change workflow deadlines
   - Cannot specify deadline type (hard/soft)
   - Your "change bedtime to 11pm" was misinterpreted as duration

### Task Attributes Not Modifiable
2. **Priority/Importance** ❌
   - Cannot change importance (1-10)
   - Cannot change urgency (1-10)
   - Already created with values but can't update

3. **Cognitive Complexity** ❌
   - Cannot set/change cognitive complexity (1-5)
   - Important for scheduling optimization

4. **Task Type** ❌
   - Cannot change between focused/admin/personal
   - Set on creation but not updatable

5. **Async Properties** ❌
   - Cannot modify asyncWaitTime
   - Cannot change isAsyncTrigger flag
   - Cannot update expectedResponseTime

6. **Project/Context** ❌
   - Cannot assign/change projectId
   - Cannot group tasks into projects

7. **Locking/Scheduling** ❌
   - Cannot lock task to specific time
   - Cannot set lockedStartTime
   - Cannot mark task as locked/unlocked

### Workflow/Step Specific Gaps
8. **Step Properties** ❌
   - Cannot change step type (focused/admin/personal)
   - Cannot modify step cognitive complexity
   - Cannot update step importance/urgency overrides
   - Cannot change step asyncWaitTime after creation
   - Cannot mark step as skipped

9. **Step Removal** ❌
   - Amendment type exists but not implemented
   - Cannot delete unwanted steps

10. **Bulk Operations** ❌
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

## Summary

The amendment applicator currently handles ~40% of possible task/workflow modifications. Critical gaps include:
- No deadline management (your use case)
- No priority/importance/urgency updates
- No cognitive complexity settings
- Incomplete step-level operations
- No task type changes after creation

These limitations mean users must manually edit many attributes through the UI rather than using voice commands, defeating the purpose of the voice amendment feature.