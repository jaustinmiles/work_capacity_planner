# Deadline-Driven Scheduling System Design

## Overview
A comprehensive scheduling system that optimizes task and workflow execution based on deadlines, cognitive complexity, productivity patterns, and async parallelization opportunities.

## Core Concepts

### 1. Deadline Types
- **Hard Deadlines**: Must be met, system fails if impossible
- **Soft Deadlines**: Target dates that generate warnings if at risk
- Both types treated similarly in scheduling algorithm, differ only in user messaging

### 2. Cognitive Complexity
- **Per Step Granularity**: Each workflow step has its own cognitive complexity rating
- **AI Assignment**: Initial values assigned during brainstorming/creation
- **User Adjustable**: Full control to modify complexity ratings
- **Scale**: 1-5 (1=trivial, 2=simple, 3=moderate, 4=complex, 5=very complex)

### 3. Productivity Patterns (Circadian Rhythms)
- **Morning Peak** (9am-12pm): High cognitive capacity
- **Post-Lunch Dip** (1pm-3pm): Lower cognitive capacity  
- **Afternoon Recovery** (3pm-5pm): Moderate cognitive capacity
- **Evening** (5pm-8pm): Variable, user-configurable
- System suggests optimal slots based on complexity matching
- Users can drag and reorder scheduled items

### 4. Priority Hierarchy
1. **Meet hard deadlines** (non-negotiable)
2. **Maximize async parallelization** (efficiency)
3. **Optimize cognitive load matching** (performance)
4. **Minimize context switching** (focus)
5. **Minimize weekend work** (configurable, not prioritized by default)

## Data Model Changes

### Task Model Extensions
```typescript
interface Task {
  // Existing fields...
  
  // New deadline fields
  deadline?: Date
  deadlineType?: 'hard' | 'soft'
  
  // Cognitive complexity (for non-workflow tasks)
  cognitiveComplexity?: 1 | 2 | 3 | 4 | 5
}
```

### TaskStep Model Extensions
```typescript
interface TaskStep {
  // Existing fields...
  
  // Cognitive complexity per step
  cognitiveComplexity?: 1 | 2 | 3 | 4 | 5
  
  // Async optimization hints
  isAsyncTrigger?: boolean  // This step kicks off async work
  expectedResponseTime?: number  // Expected wait time in minutes
}
```

### WorkSettings Extensions
```typescript
interface ProductivityPattern {
  timeRange: { start: string; end: string }
  cognitiveCapacity: 'peak' | 'high' | 'moderate' | 'low'
  preferredComplexity: number[]  // e.g., [4, 5] for peak times
}

interface WorkSettings {
  // Existing fields...
  
  // Productivity patterns
  productivityPatterns?: ProductivityPattern[]
  
  // Scheduling preferences
  schedulingPreferences?: {
    allowWeekendWork: boolean
    weekendPenalty: number  // 0-1, how much to avoid weekends
    contextSwitchPenalty: number  // Minutes lost per context switch
    asyncParallelizationBonus: number  // Priority boost for parallel work
  }
}
```

## Algorithm Design

### Mathematical Priority Functions

The scheduling algorithm uses sophisticated mathematical functions to balance multiple competing priorities:

#### 1. Deadline Pressure Function
Uses an inverse power function that grows exponentially as deadlines approach:

```
Pressure = k / (slackDays + 0.5)^p

Where:
- k = 10 for hard deadlines, 5 for soft deadlines
- p = 1.5 (controls curve steepness)
- slackDays = daysUntilDeadline - criticalPathDaysNeeded
```

This creates smooth exponential growth:
- 10 days slack → 1.0x multiplier
- 5 days slack → 1.8x multiplier  
- 2 days slack → 5.0x multiplier
- 1 day slack → 10.9x multiplier
- 0.5 days slack → 20.0x multiplier
- 0 days slack → 1000x multiplier (critical)

#### 2. Async Urgency Function
Uses exponential growth based on schedule compression:

```
AsyncUrgency = a * e^(b * compressionRatio) + timePressure

Where:
- compressionRatio = dependentWorkHours / availableTimeAfterAsync
- a = 10 (base urgency)
- b = 5 (growth rate)
- timePressure = 5 / (daysUntilDeadline + 1)
```

This prioritizes async triggers early to maximize scheduling flexibility for dependent work.

#### 3. Integrated Priority Calculation
Combines Eisenhower matrix with deadline and async pressures:

```
Priority = (importance × urgency) × deadlinePressure + asyncUrgency
```

This ensures:
- Eisenhower scoring remains the foundation
- Deadlines create multiplicative pressure
- Async tasks get additive urgency bonuses
- Low-importance tasks need extreme deadline pressure to overtake high-importance work

### Core Scheduling Algorithm

```typescript
interface SchedulingContext {
  tasks: Task[]
  workflows: SequencedTask[]
  workPatterns: DailyWorkPattern[]
  productivityPatterns: ProductivityPattern[]
  currentTime: Date
  constraints: SchedulingConstraints
  workSettings: WorkSettings
  lastScheduledItem: ScheduledItem | null
}

interface SchedulingConstraints {
  hardDeadlines: Map<string, Date>
  softDeadlines: Map<string, Date>
  cognitiveComplexities: Map<string, number>
  dependencies: Map<string, string[]>
}

interface SchedulingResult {
  schedule: ScheduledItem[]
  warnings: SchedulingWarning[]
  failures: SchedulingFailure[]
  suggestions: SchedulingSuggestion[]
}
```

### Algorithm Phases

#### Phase 1: Constraint Analysis
1. Build dependency graph
2. Calculate critical paths
3. Identify hard deadline constraints
4. Detect impossible deadlines early

#### Phase 2: Time Window Calculation
1. For each task/step with deadline:
   - Calculate latest possible start time
   - Calculate earliest possible start time (dependencies)
   - Determine scheduling window
2. Sort by urgency (window size / duration)

#### Phase 3: Cognitive Load Optimization
1. Map productivity patterns to time blocks
2. Score each potential slot:
   - Complexity match score
   - Deadline pressure score
   - Async parallelization score
   - Context switch penalty
3. Assign high-complexity tasks to peak cognitive times

#### Phase 4: Async Optimization
1. Identify async trigger points
2. Calculate optimal trigger times:
   - Work backwards from deadlines
   - Account for response times
   - Maximize parallel execution
3. Suggest review request timing

#### Phase 5: Schedule Generation
1. Place hard-deadline items first
2. Fill in soft-deadline items
3. Pack remaining items optimally
4. Generate drag-and-drop ready schedule

### Failure Mode Handling

```typescript
interface SchedulingFailure {
  type: 'impossible_deadline' | 'capacity_exceeded' | 'dependency_conflict'
  affectedItems: string[]
  severity: 'hard' | 'soft'
  
  // Suggestions for resolution
  suggestions: {
    tasksToDropOrDefer: string[]
    minimumDeadlineExtension: number  // hours
    capacityNeeded: { focused: number; admin: number }
    alternativeSchedules: SchedulingResult[]
  }
}
```

## UI/UX Design

### Deadline Input Methods

#### 1. During Creation
- Add deadline field to task/workflow creation forms
- Optional complexity rating field
- Deadline type selector (hard/soft)

#### 2. Right-Click Context Menu
```typescript
<ContextMenu>
  <MenuItem onClick={openDeadlineModal}>Set Deadline...</MenuItem>
  <MenuItem onClick={openComplexityModal}>Set Complexity...</MenuItem>
</ContextMenu>
```

#### 3. Bulk Operations
- Multi-select in task list
- Bulk deadline setter modal
- Batch complexity adjuster

### Schedule Visualization

#### Interactive Gantt Chart
- Drag-and-drop to reorder
- Visual indicators:
  - Red border: hard deadline at risk
  - Yellow border: soft deadline at risk
  - Brain icon: cognitive complexity level
  - Clock icon: async wait time
- Productivity pattern overlay (colored background zones)

### Failure Mode UI

#### Impossible Deadline Modal
```
⚠️ Cannot Meet Deadline

The task "Deploy to Production" has a hard deadline of Friday 5pm,
but based on dependencies and capacity, earliest completion is Monday 2pm.

Options:
[ ] Extend deadline by 3 days (minimum)
[ ] Drop these tasks: [Task A, Task B]
[ ] Increase daily capacity to 6 focus hours
[ ] Split workflow into phases

[Cancel] [Apply Selected Options]
```

## Implementation Plan

### Phase 1: Data Model & Basic Deadline Support
1. Add deadline fields to database schema
2. Update UI forms to include deadline input
3. Implement basic deadline-aware scheduling
4. Add right-click deadline setter

### Phase 2: Cognitive Complexity
1. Add complexity fields to schema
2. Integrate AI complexity assignment in brainstorm modal
3. Add UI for manual complexity adjustment
4. Implement complexity-aware scheduling

### Phase 3: Productivity Patterns
1. Add productivity pattern configuration to settings
2. Implement cognitive load matching algorithm
3. Add visual overlay to Gantt chart
4. Enable drag-and-drop rescheduling

### Phase 4: Async Optimization
1. Add async trigger detection
2. Implement parallel execution optimizer
3. Add review timing suggestions
4. Visual indicators for async operations

### Phase 5: Advanced Features
1. Bulk deadline operations
2. Failure mode detection and suggestions
3. Alternative schedule generation
4. Context switch minimization

## Testing Strategy

### Unit Tests
- Deadline calculation algorithms
- Cognitive load matching
- Async parallelization optimizer
- Failure detection logic

### Integration Tests
- End-to-end scheduling with deadlines
- Drag-and-drop rescheduling
- Database persistence of new fields
- AI complexity assignment

### Performance Tests
- Large dataset scheduling (100+ tasks)
- Complex dependency graphs
- Multiple deadline constraints

## Mathematical/Algorithmic Research

### Relevant Algorithms
1. **Critical Path Method (CPM)**: For deadline feasibility
2. **Resource-Constrained Project Scheduling (RCPS)**: For capacity limits
3. **Job Shop Scheduling**: For cognitive load matching
4. **Simulated Annealing**: For optimization when perfect solution impossible

### Key Papers/Resources
- "A Survey of Resource-Constrained Project Scheduling" (Hartmann & Briskorn, 2010)
- "Cognitive Load Theory" (Sweller, 1988)
- "Circadian Rhythms and Cognitive Performance" (Schmidt et al., 2007)

## Architecture Impact

### Minimal Breaking Changes
- Scheduler remains backward compatible
- New fields are optional
- Existing tests continue to pass
- Progressive enhancement approach

### New Modules
- `deadline-scheduler.ts`: Core deadline algorithm
- `cognitive-optimizer.ts`: Complexity matching
- `async-optimizer.ts`: Parallelization logic
- `schedule-validator.ts`: Constraint checking

### Extension Points
- Pluggable scoring functions
- Configurable priority weights
- Custom productivity patterns
- User preference profiles

## Migration Path

1. **Database Migration**: Add new fields with defaults
2. **Feature Flag**: Enable deadline scheduling behind flag
3. **Gradual Rollout**: Start with simple deadlines, add complexity
4. **User Education**: In-app tooltips and documentation

## Success Metrics

- Tasks completed before deadline: >95%
- Cognitive load matching accuracy: >80%
- Async parallelization improvement: >30%
- User satisfaction with suggested schedules: >4/5

## Open Questions Resolved

1. **Start simple or comprehensive?** → Start with Phase 1 (basic deadlines), architecture supports full vision
2. **Cognitive complexity granularity?** → Per step for workflows, per task for standalone
3. **Weekend prioritization?** → User configurable, not avoided by default
4. **Async optimization?** → Core feature, suggest review timing
5. **Failure handling?** → Show drops, extensions, and alternatives

## Next Steps

1. Review and approve design document
2. Create database migration for new fields
3. Implement Phase 1 (basic deadline support)
4. Write comprehensive tests
5. Iterate based on user feedback