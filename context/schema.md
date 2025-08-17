# Data Structures & Key Definitions

## Core Data Models

### Task (Unified Model)
- Single table for both tasks and workflows
- `hasSteps: boolean` - Indicates if this is a workflow
- `steps: TaskStep[]` - Array of workflow steps (if hasSteps=true)
- `type: TaskType` - Enum: Focused | Admin | Mixed
- `status: TaskStatus` - Enum: Pending | InProgress | Completed | Blocked

### TaskStep
- Individual steps within a workflow
- Must include `taskId` reference
- Has `percentComplete` field (required)
- Can have dependencies on other steps

### WorkPattern
- Daily work schedule with time blocks
- `focusMinutes` and `adminMinutes` for capacity
- NOT `focused` or `admin` (old pattern removed)

### Amendment Types
- StatusUpdate
- TimeLog
- NoteAddition
- DurationChange
- StepAddition
- StepRemoval (TODO)
- DependencyChange (TODO)
- TaskCreation (TODO)
- WorkflowCreation (TODO)

## Key Enums (from /src/shared/enums.ts)

### TaskType
```typescript
export enum TaskType {
  Focused = 'focused',
  Admin = 'admin',
  Mixed = 'mixed',
}
```

### TaskStatus
```typescript
export enum TaskStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Blocked = 'blocked'
}
```

### TaskCategory
```typescript
export enum TaskCategory {
  Work = 'work',
  Personal = 'personal'
}
```

## Critical Format Requirements

### SequencedTask Format (UI Compatibility)
The UI expects workflows in SequencedTask format with:
- `totalDuration` field
- `steps` array
- `criticalPathDuration`
- The `formatTask()` method MUST check `task.TaskStep` (capital T)

### IPC Communication
- All enums must be serialized properly through IPC
- Database methods return plain objects, not Prisma models
- JSON fields must be parsed before returning