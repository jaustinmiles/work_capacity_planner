# Mental Models: Understanding the Task Planner Architecture

## Why Mental Models Matter

PR #76 taught us that without a clear mental model of the system, changes become dangerous. You can't safely modify what you don't understand. This document provides the essential mental models for working with this codebase.

## Core System Architecture

### The Three-Layer Architecture
```
┌─────────────────────────────────────────────┐
│           RENDERER PROCESS (UI)             │
│  React Components + Zustand Store           │
│  src/renderer/                              │
└─────────────┬───────────────────────────────┘
              │ IPC Channels
              │ (Typed Messages)
┌─────────────▼───────────────────────────────┐
│           MAIN PROCESS (Backend)            │
│  Services + Database + File System          │
│  src/main/                                  │
└─────────────┬───────────────────────────────┘
              │ Shared Logic
              │ (Pure Functions)
┌─────────────▼───────────────────────────────┐
│           SHARED MODULE                     │
│  Types, Utils, Business Logic               │
│  src/shared/                                │
└─────────────────────────────────────────────┘
```

**Key Principle**: Data flows DOWN, events flow UP.

## Domain Models

### 1. The Task Hierarchy
```
         Session (Active Container)
              │
              ├── Tasks (Individual Work Items)
              │    ├── Properties: duration, importance, urgency
              │    ├── Type: focused, admin, personal
              │    └── Status: not_started, in_progress, completed
              │
              └── Workflows (Multi-Step Processes)
                   ├── Properties: total duration, dependencies
                   └── Steps (Sequential Tasks)
                        ├── Dependencies between steps
                        └── Critical path calculation
```

### 2. The Scheduling System
```
     UnifiedScheduler (Single Source of Truth)
              │
              ├── Input: Tasks + WorkPatterns + CurrentTime
              │
              ├── Processing:
              │    1. Priority Calculation (importance × urgency)
              │    2. Capacity Matching (task type → block type)
              │    3. Time Allocation (duration → available capacity)
              │    4. Dependency Resolution (workflows)
              │
              └── Output: ScheduledItem[]
                   ├── taskId/workflowId
                   ├── startTime
                   ├── endTime
                   └── blockId (which work block)
```

### 3. The Capacity System (Unified in PR #76)
```
        WorkPattern (Daily Schedule)
              │
              ├── WorkBlocks[] (Time Segments)
              │    ├── startTime/endTime
              │    ├── type: focused|admin|mixed|flexible
              │    └── capacity: {                    // NEW UNIFIED STRUCTURE
              │         totalMinutes: number
              │         type: WorkBlockType (enum)
              │         splitRatio?: { focus, admin }
              │        }
              │
              └── Meetings[] (Blocked Time)
                   ├── startTime/endTime
                   └── recurring: daily|weekly|none
```

## Critical Relationships

### Task ↔ WorkBlock Matching
```javascript
// The Core Matching Logic
TaskType.Focused → WorkBlockType.Focused | WorkBlockType.Mixed | WorkBlockType.Flexible
TaskType.Admin → WorkBlockType.Admin | WorkBlockType.Mixed | WorkBlockType.Flexible
TaskType.Personal → WorkBlockType.Personal | WorkBlockType.Flexible

// Capacity Calculation (PR #76 unified this)
Mixed Block: capacity.splitRatio determines focus vs admin allocation
Flexible Block: Full capacity available for any task type
```

### Time Flow Model
```
Past ──────────┬────────── Future
               │
         Current Time
               │
       ┌───────┴────────┐
       │ Scheduling     │
       │ Horizon        │
       └────────────────┘
         Tasks must fit within
         available work blocks
```

## State Management Model

### Zustand Store Architecture
```
            useTaskStore (Global State)
                    │
    ┌───────────────┼───────────────┐
    │               │               │
  Tasks          Sessions      WorkPatterns
    │               │               │
Components     ActiveSession    Scheduler
 Subscribe     Determines       Uses for
 to slices     Task Context     Capacity
```

### Data Flow Patterns

#### Pattern 1: User Action → State Update
```
1. User clicks button in Component
2. Component calls store action
3. Store updates state
4. Store triggers IPC to main process
5. Main process updates database
6. Main process returns confirmation
7. Store finalizes state
8. Components re-render
```

#### Pattern 2: Background Process → UI Update
```
1. Main process detects change (file watch, timer, etc.)
2. Main sends IPC event to renderer
3. Renderer IPC handler updates store
4. Store notifies subscribed components
5. Components re-render with new data
```

## Common Pitfalls and Their Models

### The Optional Chaining Trap
```javascript
// WRONG Mental Model: "Safety through optionality"
task?.capacity?.used ?? 0  // Hides missing data

// RIGHT Mental Model: "Fail fast with clear errors"
if (!task.capacity) {
  throw new Error('Task missing required capacity field')
}
return task.capacity.used
```

### The Type Assertion Escape
```typescript
// WRONG Mental Model: "TypeScript is in my way"
const item = data as any  // "I'll fix types later"

// RIGHT Mental Model: "Types are documentation"
interface ScheduledTaskData {
  taskId: string
  startTime: Date
  capacity: BlockCapacity
}
const item = data as ScheduledTaskData
```

### The Whack-a-Mole Debugging
```
// WRONG Mental Model: "Fix errors as they appear"
Error → Fix locally → New Error → Fix locally → ...

// RIGHT Mental Model: "Understand the system"
Error → Find root cause → Identify pattern → Fix systematically
```

## System Invariants (Never Violate These)

1. **Session Containment**: All tasks/workflows belong to exactly one session
2. **Capacity Conservation**: Scheduled time ≤ Available capacity
3. **Type Consistency**: Task type must match block type compatibility
4. **Dependency Order**: Workflow steps execute in dependency order
5. **Time Monotonicity**: startTime < endTime for all scheduled items
6. **State Synchronization**: UI state reflects database state

## Integration Points

### Where Systems Connect
```
┌────────────────┐     IPC      ┌────────────────┐
│   UI Component │───────────────│  Main Service  │
│                │               │                │
│  EditTaskModal │──task:update──│ DatabaseService│
│                │               │                │
│  useTaskStore  │←─task:updated─│ Returns updated│
│                │               │      task      │
└────────────────┘               └────────────────┘
```

### Critical Integration Paths

1. **Task Creation Flow**
   - UI → Store → IPC → Database → Store → UI

2. **Scheduling Flow**
   - Store → UnifiedScheduler → ScheduledItems → UI

3. **Work Pattern Update Flow**
   - UI → Store → IPC → Database → Scheduler Recalc → UI

4. **Session Activation Flow**
   - UI → Store → Load Tasks → Load Patterns → Enable Features

## Debugging Mental Models

### The Inspection Hierarchy
```
1. Check UI State (React DevTools)
   ↓ If state is wrong
2. Check Store State (Zustand DevTools)
   ↓ If store is wrong
3. Check IPC Messages (Console logs)
   ↓ If messages are wrong
4. Check Database (SQLite browser)
   ↓ If data is wrong
5. Check Business Logic (Unit tests)
```

### The Fix Priority Model
```
Priority 1: Type Errors (blocks everything)
    ↓
Priority 2: Test Failures (blocks quality)
    ↓
Priority 3: Lint Errors (blocks standards)
    ↓
Priority 4: Console Warnings (technical debt)
    ↓
Priority 5: Performance (user experience)
```

## Architecture Decision Records

### Why UnifiedScheduler?
**Problem**: 4 different schedulers with inconsistent behavior
**Solution**: Single scheduler with adapter pattern for compatibility
**Trade-off**: Initial complexity for long-term maintainability

### Why Zustand over Redux?
**Problem**: Redux boilerplate overwhelming for this app size
**Solution**: Zustand provides simpler API with TypeScript support
**Trade-off**: Less ecosystem, but much less complexity

### Why Electron IPC over REST?
**Problem**: Need real-time bidirectional communication
**Solution**: IPC provides type-safe, fast local communication
**Trade-off**: Can't easily move to web without major refactor

### Why Prisma over Raw SQL?
**Problem**: Type safety and migrations needed
**Solution**: Prisma provides both with good DX
**Trade-off**: Additional dependency and build step

## Quick Reference Cards

### Card 1: Where to Find Things
```
UI Components → src/renderer/components/
State Management → src/renderer/store/
Backend Services → src/main/services/
Database Schema → prisma/schema.prisma
Shared Types → src/shared/types.ts
Scheduling Logic → src/shared/unified-scheduler.ts
```

### Card 2: Common Operations
```
Create Task → useTaskStore.addTask()
Update Task → useTaskStore.updateTask()
Schedule Tasks → UnifiedScheduler.scheduleTasks()
Save Pattern → workPatternService.savePattern()
Activate Session → useTaskStore.setActiveSession()
```

### Card 3: Type Imports
```typescript
import { Task, Workflow } from '@/shared/types'
import { WorkBlockType, TaskType } from '@/shared/enums'
import { UnifiedScheduler } from '@/shared/unified-scheduler'
import { useTaskStore } from '@/store/taskStore'
import { logger } from '@/shared/logger'
```

## Mental Model Validation Questions

Before making changes, ask yourself:

1. **Which layer am I modifying?** (Renderer/Main/Shared)
2. **What are the downstream effects?** (What depends on this?)
3. **What are the upstream dependencies?** (What does this depend on?)
4. **Which invariants might I violate?** (Check the list above)
5. **Is there an existing pattern to follow?** (Check similar code)
6. **How will this affect the scheduler?** (Most changes do)
7. **How will this affect the UI?** (State changes trigger re-renders)
8. **What tests need updating?** (Both unit and integration)

## The Ultimate Mental Model

**Think of the system as a deterministic state machine:**

```
Current State + User Action = New State
Current State + Time Passage = New State  
Current State + External Event = New State

Where:
- State = Database + Store + UI
- Actions = User interactions
- Time = Scheduler recalculations
- Events = IPC messages, timers
```

**Every bug is a violation of this model:**
- State inconsistency → Store not synced with database
- Incorrect transition → Wrong action handler
- Missing transition → Unhandled edge case

---

*Remember: A clear mental model is worth a thousand debugger sessions.*