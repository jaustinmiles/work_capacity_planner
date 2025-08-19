# Task Splitting Proposal

## Problem Statement
The current scheduling algorithm leaves significant unused time slots because it treats tasks as atomic units. This results in:
- Empty 30-60 minute blocks that could be utilized
- Unused capacity when a task is slightly larger than available time
- Poor time optimization overall

## Current Examples from Production
- 60 minutes completely empty (could fit 2x30min chunks)
- 40 focus minutes unused (could fit part of a 60min task)
- 60 admin minutes unused (could fit multiple small tasks)
- 30 personal minutes empty (perfect for small tasks)

## Proposed Solution

### 1. Task Splitting Rules
- Allow tasks to be split into minimum 15-minute chunks
- Maintain task coherence with a "preferred minimum chunk" (e.g., 30 minutes)
- Track split tasks with parent-child relationship
- Ensure all chunks of a task maintain the same type (focus/admin/personal)

### 2. Implementation Approach

```typescript
interface SplitTask {
  parentTaskId: string
  chunkIndex: number
  totalChunks: number
  chunkDuration: number
  originalDuration: number
}

// When scheduling:
1. Try to schedule task as whole (current behavior)
2. If no space, check if any blocks have partial capacity
3. Split task into chunks that fit available slots
4. Track chunk relationships for UI display
```

### 3. Prioritization for Splitting
1. First, try to fit tasks whole
2. Then, split larger tasks (>60 minutes) to fill gaps
3. Finally, split smaller tasks if needed
4. Respect task dependencies (all chunks of a dependency must complete before dependent starts)

### 4. UI Considerations
- Show split tasks with visual connection (e.g., "Task A (Part 1/3)")
- Allow users to set "Do not split" flag on specific tasks
- Display split warnings in debug info

### 5. Algorithm Changes

```typescript
// Pseudo-code for enhancement
function tryScheduleWithSplitting(task, availableSlots) {
  // Try whole task first
  const wholeSlot = findSlotForWhole(task, availableSlots)
  if (wholeSlot) return scheduleWhole(task, wholeSlot)
  
  // Find all partial slots that could fit chunks
  const partialSlots = findPartialSlots(task, availableSlots)
  if (partialSlots.length === 0) return false
  
  // Calculate optimal split
  const chunks = calculateOptimalSplit(task, partialSlots)
  return scheduleChunks(task, chunks, partialSlots)
}
```

## Benefits
1. **Better Time Utilization**: Fill 90-95% of available time vs current ~70%
2. **Flexibility**: Accommodate varying work patterns
3. **Realism**: Matches how people actually work (tasks get interrupted)

## Configuration Options
```typescript
interface TaskSplittingConfig {
  enableSplitting: boolean
  minimumChunkSize: number // default: 15 minutes
  preferredChunkSize: number // default: 30 minutes
  maxChunks: number // default: 4 (don't split into too many pieces)
  respectTaskBoundaries: boolean // some tasks shouldn't be split
}
```

## Implementation Priority
HIGH - This directly addresses user's concern about unused time optimization