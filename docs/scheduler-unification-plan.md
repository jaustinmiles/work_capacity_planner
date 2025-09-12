# Scheduler Unification Migration Plan

**Created**: 2025-01-11  
**Status**: In Progress  
**Goal**: Complete migration to UnifiedScheduler, removing all legacy scheduler implementations

## Overview

This document outlines the plan to complete the scheduler unification effort, migrating all components from the legacy schedulers (deadline-scheduler, flexible-scheduler, optimal-scheduler, SchedulingEngine) to the unified UnifiedScheduler implementation.

## Current State

### What's Already Migrated
- ✅ WeeklyCalendar (PR #70)
- ✅ GanttChart (partial - uses UnifiedScheduler for some operations)

### What Still Needs Migration
- 🔄 ScheduleGenerator (in progress)
- ⏳ DailyScheduleView
- ⏳ SchedulingDebugInfo
- ⏳ FeedbackForm
- ⏳ schedule-formatter
- ⏳ SchedulingService
- ⏳ 21 test files

## Migration Strategy

### Core Approach: Schedule-then-Trim

Instead of generating blocks preemptively, we:
1. **Define time constraints** for each scheduling mode
2. **Let UnifiedScheduler optimize** within those constraints
3. **Trim generated blocks** to fit the actual scheduled tasks

This leverages existing optimization logic while maintaining separation of concerns.

## Phase 1: ScheduleGenerator Migration (Current)

### Problem Analysis
ScheduleGenerator currently:
- Schedules tasks using old schedulers
- Reverse-engineers work blocks from scheduled tasks
- This backwards approach causes bugs

### Solution
Transform it to:
1. Pass time constraints to UnifiedScheduler
2. Let scheduler optimize task placement
3. Generate blocks that encapsulate the scheduled tasks

### Schedule Generation Modes

#### 1. Optimal Mode
- **Time Range**: 7am-11pm (16 hours/day)
- **Weekends**: Included
- **Focus**: Front-load async work for parallelization
- **Block Type**: Universal (any task type)
- **Use Case**: Critical deadlines, maximum throughput

#### 2. Balanced Mode  
- **Time Range**: 8am-7pm (11 hours/day)
- **Weekends**: Optional based on deadlines
- **Focus**: Balance productivity with sustainability
- **Block Type**: Flexible (focus or admin)
- **Use Case**: Normal project work

#### 3. Regular Mode
- **Time Range**: 9am-5pm (8 hours/day)
- **Weekends**: Never
- **Focus**: Standard working hours only
- **Block Type**: Mixed (predetermined ratios)
- **Use Case**: Maintenance work, low pressure periods

### Implementation Steps

1. **Add Universal Block Type**
   ```typescript
   // In enums.ts
   export enum BlockType {
     Focus = 'focus',
     Admin = 'admin', 
     Personal = 'personal',
     Flexible = 'flexible',  // focus OR admin
     Mixed = 'mixed',        // predetermined mix
     Universal = 'universal' // ANY task type
   }
   ```

2. **Update ScheduleGenerator Imports**
   ```typescript
   // Remove
   import { scheduleWithDeadlines } from '../../utils/deadline-scheduler'
   import { generateOptimalSchedule } from '../../utils/flexible-scheduler'
   
   // Add
   import { UnifiedSchedulerAdapter } from '../../../shared/unified-scheduler-adapter'
   ```

3. **Replace Scheduler Calls**
   - Use `UnifiedSchedulerAdapter.scheduleTasks()` 
   - Pass appropriate time constraints for each mode
   - Keep block trimming logic

## Phase 2: Component Migration

### Priority Order

#### High Priority (User-Facing)
1. **DailyScheduleView** - Shows today's schedule
2. **SchedulingDebugInfo** - Debug panel for scheduler
3. **FeedbackForm** - Collects scheduling feedback
4. **schedule-formatter** - Formats schedule display

#### Critical Path
5. **SchedulingService** - Core scheduling service using SchedulingEngine

### Migration Pattern

For each component:
1. Update imports to use UnifiedSchedulerAdapter
2. Replace old scheduler calls
3. Update type definitions if needed
4. Test thoroughly
5. Update associated tests

## Phase 3: Cleanup

### Files to Delete

After all migrations complete:
```
/src/renderer/utils/deadline-scheduler.ts
/src/renderer/utils/deadline-scheduler.test.ts
/src/renderer/utils/flexible-scheduler.ts
/src/renderer/utils/flexible-scheduler.test.ts
/src/renderer/utils/optimal-scheduler.ts
/src/renderer/utils/optimal-scheduler.test.ts
/src/shared/scheduling-engine.ts
/src/shared/scheduling-engine.test.ts
```

### Documentation Updates
- `architecture.md` - Remove references to multiple schedulers
- `TECH_DEBT.md` - Mark scheduler unification as RESOLVED
- `context/state.md` - Update completion status
- `INCOMPLETE_WORK.md` - Remove scheduler unification items

## Testing Strategy

### Unit Tests
- Update tests to use UnifiedScheduler
- Remove tests for deleted schedulers
- Add tests for universal block type

### Integration Tests  
- Verify ScheduleGenerator works with all three modes
- Test time constraint enforcement
- Validate block generation

### E2E Tests
- Ensure UI continues to function
- Test schedule generation flow
- Verify saved patterns work correctly

## Success Metrics

- [ ] Zero imports of old schedulers in production code
- [ ] All tests passing with UnifiedScheduler
- [ ] Old scheduler files deleted
- [ ] Documentation updated
- [ ] No regression in scheduling quality
- [ ] Performance maintained or improved

## Risk Mitigation

### Incremental Approach
- One component at a time
- Keep tests green throughout
- Commit after each successful migration

### Compatibility Layer
- UnifiedSchedulerAdapter provides backward compatibility
- Minimal changes to component logic
- Type safety maintained

### Rollback Plan
- Git history preserves old implementations
- Could temporarily restore if critical issues
- But goal is forward-only migration

## Timeline

- **Phase 1** (ScheduleGenerator): 2-3 hours
- **Phase 2** (Components): 4-6 hours
- **Phase 3** (Cleanup): 1-2 hours
- **Total**: ~8-12 hours of focused work

## Notes

### Why Schedule-then-Trim?
The user correctly identified that having the scheduler do optimization first, then trimming blocks to fit, is better than trying to predict block needs upfront. This approach:
- Leverages existing optimization logic
- Guarantees feasible schedules
- Simplifies implementation
- Maintains separation of concerns

### Universal Block Type
Adding a "universal" block type that accepts any task type provides maximum flexibility for the scheduler to optimize task placement without artificial constraints.

---

*This plan will be updated as the migration progresses.*