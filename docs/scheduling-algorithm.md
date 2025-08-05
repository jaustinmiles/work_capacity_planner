# Scheduling Algorithm Design

## Overview

The Work Capacity Planner uses a sophisticated scheduling algorithm that converts simple tasks and complex workflows into an optimized timeline. The system respects capacity constraints, dependencies, and user priorities while automatically filling async wait periods with other work.

## Core Principles

### 1. Capacity-Aware Scheduling
- **4 hours maximum** focused work per day
- **3 hours maximum** admin/meeting time per day  
- **7-hour total** work day with user-configurable start times and breaks
- **Overflow handling** when demand exceeds capacity

### 2. Priority-Based Allocation
- Primary sort: `urgency × importance` (Eisenhower method)
- User-configurable tie-breaking for equal priorities
- Dependency weighting adjusts priority scores
- Deadline pressure increases urgency over time

### 3. Dependency Resolution
- **Strict dependencies**: ALL prerequisites must complete before item can start
- **Topological sorting** ensures correct execution order
- **Cycle detection** prevents impossible dependency loops
- **Cross-workflow dependencies** supported (Task A blocks Workflow B)

### 4. Async Wait Optimization
- **Automatic backfilling**: Lower-priority items scheduled during wait periods
- **Capacity-aware filling**: Respects daily limits even during waits
- **Wait period tracking**: Visual indication of external process delays

## Scheduling Algorithm Steps

### Phase 1: Data Preparation
1. **Convert to SchedulableItems**
   - Simple tasks → Single schedulable item
   - Sequenced workflows → Multiple schedulable items (one per step)
   - Preserve dependency relationships

2. **Calculate Priority Scores**
   ```typescript
   rawScore = importance × urgency
   adjustedScore = rawScore + dependencyWeight + deadlinePressure
   ```

3. **Build Dependency Graph**
   - Create adjacency list of dependencies
   - Detect cycles (return error if found)
   - Calculate dependency depth for priority adjustment

### Phase 2: Time Slot Generation
1. **Create Work Day Templates**
   - Parse user's work day configuration
   - Generate time slots for each work day
   - Account for meetings, breaks, and blocked time

2. **Calculate Available Capacity**
   ```typescript
   dailyCapacity = {
     focused: min(maxFocusedMinutes, availableWorkMinutes),
     admin: min(maxAdminMinutes, availableWorkMinutes - focusedMinutes)
   }
   ```

### Phase 3: Dependency-Aware Scheduling
1. **Topological Sort**
   - Order items by dependency requirements
   - Items with no dependencies scheduled first
   - Dependent items scheduled after prerequisites

2. **Priority Queue Processing**
   ```typescript
   while (unscheduledItems.length > 0) {
     item = getNextReadyItem(unscheduledItems, completedDependencies)
     timeSlot = findBestTimeSlot(item, availableSlots, constraints)
     scheduleItem(item, timeSlot)
   }
   ```

3. **Best Time Slot Selection**
   - Prefer earliest available slot matching work type (focused/admin)
   - Respect capacity constraints
   - Consider async wait periods for optimal placement

### Phase 4: Async Wait Optimization
1. **Identify Wait Periods**
   - Extract async wait times from scheduled items
   - Create AsyncWaitPeriod objects for each wait

2. **Backfill with Lower-Priority Items**
   ```typescript
   for (waitPeriod of asyncWaitPeriods) {
     availableItems = getUnscheduledItemsFittingInWait(waitPeriod)
     optimalItem = selectBestFillerItem(availableItems, waitPeriod)
     if (optimalItem) scheduleInWaitPeriod(optimalItem, waitPeriod)
   }
   ```

### Phase 5: Conflict Resolution & Optimization
1. **Detect Conflicts**
   - Capacity exceeded on any day
   - Impossible deadlines
   - Dependency cycles

2. **Generate Optimization Suggestions**
   - Extend work days for high-priority items
   - Reorder items to better utilize capacity
   - Identify underutilized time periods

## Priority Calculation Details

### Base Priority Score
```typescript
baseScore = importance × urgency  // Range: 1-100
```

### Dependency Weighting
Items with many dependents get slight priority boost:
```typescript
dependencyWeight = Math.log(numberOfDependents + 1) × 2
```

### Deadline Pressure
As deadlines approach, urgency increases:
```typescript
daysUntilDeadline = (deadline - today) / (1000 * 60 * 60 * 24)
pressureMultiplier = Math.max(1, (30 - daysUntilDeadline) / 30)
adjustedUrgency = urgency × pressureMultiplier
```

### Tie-Breaking Methods
When items have identical adjusted scores:
- **creation_date**: Older items first (FIFO)
- **duration_shortest**: Shorter tasks first (quick wins)
- **duration_longest**: Longer tasks first (big rocks first)
- **alphabetical**: Lexicographic sort by name

## Capacity Management

### Daily Capacity Calculation
```typescript
workDayMinutes = (endTime - startTime) - totalBreakMinutes - meetingMinutes
focusedCapacity = Math.min(maxFocusedMinutes, workDayMinutes × 0.57) // ~4h of 7h day
adminCapacity = workDayMinutes - focusedCapacity
```

### Overflow Handling
When daily capacity exceeded:
1. **Strict Mode**: Reject scheduling, return conflict
2. **Flexible Mode**: Schedule with warning, suggest solutions
3. **Overtime Mode**: Allow extended work day with user approval

### Async Wait Period Rules
During async waits:
- Original item is "waiting" status
- Capacity available for other items
- Wait period tracked separately from regular work
- Filler items cannot exceed remaining daily capacity

## Error Handling & Edge Cases

### Dependency Cycles
```typescript
// Example cycle: A depends on B, B depends on C, C depends on A
if (hasCycle(dependencyGraph)) {
  return {
    success: false,
    conflicts: [{
      type: 'dependency_cycle',
      affectedItems: cycleItems,
      description: 'Circular dependency detected'
    }]
  }
}
```

### Impossible Schedules
- Required work exceeds available capacity
- Dependencies create scheduling conflicts
- Fixed deadlines cannot be met

### Partial Scheduling
When some items cannot be scheduled:
- Return successfully scheduled items
- List unscheduled items with reasons
- Provide optimization suggestions

## Performance Considerations

### Time Complexity
- Dependency sort: O(V + E)
- Priority calculation: O(n log n)
- Time slot allocation: O(n × d) where d = days in schedule
- Overall: O(n log n + n × d)

### Optimization Strategies
- Cache dependency graphs between runs
- Pre-calculate priority scores
- Use binary search for time slot finding
- Incremental updates for single item changes

## Testing Strategy

### Unit Tests
- Priority calculation with various scenarios
- Dependency resolution with complex graphs
- Capacity calculations with different work configurations
- Edge cases (cycles, overflows, impossible schedules)

### Integration Tests
- Full scheduling pipeline with mixed tasks/workflows
- Multi-week schedules with varying capacity
- Real-world scenarios with actual user data

### Performance Tests
- Large datasets (1000+ items)
- Complex dependency graphs (100+ interconnected items)
- Memory usage and execution time benchmarks