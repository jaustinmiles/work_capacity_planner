# Architecture Improvements Needed

## 1. Unify Workflow/Task Model (HIGH PRIORITY)

### Current Problems
- Workflows are stored as Tasks with `hasSteps=true` 
- This creates constant type confusion and casting
- Priority calculation creates fake Task objects from TaskSteps
- Duplicate logic for handling tasks vs workflow steps throughout codebase

### Proposed Solution
```typescript
// Option 1: Separate entities completely
interface SchedulableItem {
  id: string
  name: string
  duration: number
  priority: number
  asyncWaitTime: number
  deadline?: Date
  // Common scheduling fields
}

interface Task extends SchedulableItem {
  type: 'task'
  importance: number
  urgency: number
  taskType: TaskType
}

interface WorkflowStep extends SchedulableItem {
  type: 'workflow-step'
  workflowId: string
  dependsOn: string[]
  status: StepStatus
}

// Option 2: Use discriminated union
type WorkItem = 
  | { kind: 'task'; data: Task }
  | { kind: 'workflow'; data: Workflow }
  | { kind: 'step'; data: TaskStep; workflow: Workflow }
```

### Impact
- Eliminate type casting and fake object creation
- Clear separation of concerns
- Simplified priority calculation
- Reduced bugs from type confusion

## 2. Consolidate Configuration (MEDIUM PRIORITY)

### Current Problems
- Multiple config objects passed through component hierarchy:
  - SchedulingPreferences
  - WorkSettings  
  - ProductivityPatterns
  - SchedulingOptions
- Each component needs to thread these through
- Hard to maintain and extend

### Proposed Solution
```typescript
// Create unified scheduling context
interface SchedulingConfig {
  preferences: {
    contextSwitchPenalty: number
    asyncParallelizationBonus: number
    weekendPenalty: number
    // etc
  }
  workHours: {
    default: WorkHours
    custom: Record<string, WorkHours>
  }
  capacity: {
    focusHours: number
    adminHours: number
    personalHours: number
  }
  productivity: ProductivityPattern[]
}

// Use React Context or Zustand store
const useSchedulingConfig = () => {
  return useStore(state => state.schedulingConfig)
}
```

### Impact
- Single source of truth for scheduling config
- Reduced prop drilling
- Easier to add new config options
- Better testability

## 3. Remove Duplicate Scheduler Code (LOW PRIORITY)

### Current Problems
- Multiple scheduler implementations with overlapping logic
- deadline-scheduler.ts and flexible-scheduler.ts have duplicate code
- Priority calculation exists in multiple places
- Dead code from old implementations

### Proposed Solution
- Merge into single scheduler with strategy pattern
- Extract common priority calculation
- Remove unused scheduler code
- Create clear interfaces for scheduling strategies

## 4. Simplify Priority Calculation

### Current Problems  
- Priority calculation spread across multiple functions
- Complex parameter passing (context objects)
- Debug info calculation separate from actual priority
- Async boost logic duplicated

### Proposed Solution
```typescript
class PriorityCalculator {
  constructor(private config: SchedulingConfig) {}
  
  calculate(item: SchedulableItem): PriorityBreakdown {
    const factors = {
      base: this.calculateBase(item),
      deadline: this.calculateDeadlineBoost(item),
      async: this.calculateAsyncBoost(item),
      cognitive: this.calculateCognitiveMatch(item),
      contextSwitch: this.calculateContextPenalty(item)
    }
    
    return {
      ...factors,
      total: this.combineFactors(factors)
    }
  }
}
```

## 5. Fix WorkItem Type Confusion

### Current Problems
- WorkItem interface in flexible-scheduler has originalItem that could be Task or TaskStep
- Constant casting between types
- Priority calculation needs to handle both types differently

### Proposed Solution
- Make WorkItem generic or use discriminated union
- Eliminate originalItem reference, store needed fields directly
- Clear type boundaries

## Quick Wins

1. **Remove unused imports and dead code**
   - Old scheduler implementations
   - Commented out code blocks
   - Unused utility functions

2. **Consolidate duplicate interfaces**
   - Multiple definitions of similar types
   - Merge overlapping interfaces

3. **Extract magic numbers to constants**
   - Priority boost values
   - Time thresholds
   - Capacity calculations

4. **Simplify component prop interfaces**
   - Many components pass through unused props
   - Could use context instead of prop drilling

## Migration Strategy

1. Start with WorkItem type cleanup (least disruptive)
2. Create unified config context (can coexist with current approach)
3. Gradually migrate components to use context
4. Refactor workflow/task model (most disruptive, do last)
5. Remove dead code throughout

## Benefits

- Reduced bugs from type confusion
- Easier to understand and maintain
- Better performance (less object creation)
- Clearer architecture boundaries
- Easier to add new features