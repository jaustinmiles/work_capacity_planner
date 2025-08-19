# Debug Info Architecture Fix

## Current Problems
1. **Multiple tracking points**: Blocks are tracked in multiple places causing duplicates
2. **Scope issues**: `blockCapacities` is recreated each iteration, losing context
3. **Timing issues**: Blocks tracked before/after scheduling inconsistently
4. **Reference issues**: Shallow copies don't preserve state properly

## Root Cause
The fundamental issue is that the debug tracking is interleaved with the scheduling algorithm itself, making it fragile and error-prone.

## Proposed Solution

### Clean Architecture Approach

```typescript
interface DebugTracker {
  // Single source of truth for all blocks across all days
  private allBlocks: Map<string, DayBlocks>
  
  // Track when a day's blocks are initialized
  registerDay(date: string, blocks: BlockCapacity[]): void
  
  // Update when items are scheduled
  recordScheduledItem(date: string, blockId: string, item: WorkItem): void
  
  // Generate final report ONCE at the end
  generateReport(): BlockUtilization[]
}
```

### Implementation Strategy

1. **Separate Concerns**: Debug tracking should be completely separate from scheduling logic
2. **Single Registration**: Each day's blocks registered ONCE when created
3. **Incremental Updates**: Track changes as they happen, not retrospectively
4. **Final Report**: Generate utilization report ONCE at the very end

### Key Changes Needed

```typescript
// At the start of scheduling
const debugTracker = new DebugTracker()

// When blocks are created for a day
const blockCapacities = pattern.blocks.map(block => getBlockCapacity(block, currentDate))
debugTracker.registerDay(dateStr, blockCapacities)

// When an item is scheduled
debugTracker.recordScheduledItem(dateStr, block.blockId, item)

// At the very end
debugInfo.blockUtilization = debugTracker.generateReport()
```

### Benefits
1. **Bulletproof**: Single source of truth, no duplicates
2. **Maintainable**: Debug logic isolated from scheduling logic
3. **Accurate**: Tracks actual state changes as they happen
4. **Testable**: Can unit test debug tracking independently

## Immediate Fix (without major refactor)

If we can't do a full refactor immediately, the minimal fix is:

1. Track blocks in a Map keyed by `${date}-${blockId}` to prevent duplicates
2. Update the Map entry each time a block changes
3. Convert Map to array ONCE at the very end
4. Remove ALL intermediate tracking points

```typescript
// Global map for the entire scheduling run
const blockUtilizationMap = new Map<string, BlockUtilization>()

// When blocks are created
blockCapacities.forEach(block => {
  const key = `${dateStr}-${block.blockId}`
  if (!blockUtilizationMap.has(key)) {
    blockUtilizationMap.set(key, createBlockUtilization(dateStr, block))
  }
})

// When item is scheduled
const key = `${dateStr}-${block.blockId}`
const utilization = blockUtilizationMap.get(key)
if (utilization) {
  updateUtilization(utilization, item)
}

// At the very end
debugInfo.blockUtilization = Array.from(blockUtilizationMap.values())
```