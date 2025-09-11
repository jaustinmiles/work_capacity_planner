# Cleanup Needed - Technical Debt Inventory

## Console.log Cleanup (77 instances)

### High Priority Files (Core Logic)
These files contain console statements in critical business logic:
- `src/main/database.ts` - Database operations shouldn't use console
- `src/shared/time-provider.ts` - Time calculations need proper logging
- `src/shared/unified-scheduler-adapter.ts` - Scheduler adapter needs logger
- `src/renderer/utils/scheduling-common.ts` - Scheduling utilities

### UI Components (Lower Priority)
These can be cleaned up incrementally:
- `src/renderer/App.tsx` - Main app component
- `src/renderer/components/tasks/TaskItem.tsx` - Task display
- `src/renderer/components/tasks/InteractiveWorkflowGraph.tsx` - Workflow visualization
- `src/renderer/components/timeline/GanttChart.tsx` - Timeline view
- `src/renderer/components/work-logger/WorkLoggerCalendar.tsx` - Work logging

### Dev/Debug Components (Acceptable)
These components are for development and may keep console:
- `src/renderer/components/dev/FeedbackViewer.tsx` - Development tool
- `src/renderer/components/dev/LogViewer.tsx` - Log viewing component
- `src/logging/*` - Logger implementation files (these SHOULD use console)

## Lint Warning Categories (1,947 total)

### Most Common Warnings (estimate based on patterns)
1. **Unused variables** (~500) - Dead code that should be removed
2. **Missing dependencies in useEffect** (~400) - React hook issues
3. **Any type usage** (~300) - TypeScript type safety violations
4. **Unused imports** (~200) - Import cleanup needed
5. **No explicit return type** (~200) - TypeScript best practices
6. **Prefer const** (~100) - Use const instead of let
7. **Console statements** (~77) - Already tracked above
8. **Other** (~170) - Various minor issues

### Quick Wins
Run these commands to fix many warnings automatically:
```bash
# Fix all auto-fixable issues
npm run lint -- --fix

# Remove unused imports specifically
npx eslint src/ --fix --rule 'no-unused-vars: error'

# Fix prefer-const issues
npx eslint src/ --fix --rule 'prefer-const: error'
```

## Unused Exports

### Suspected Dead Code
These patterns suggest unused code:
- Old scheduler implementations (generateSchedule, getOptimalSchedule)
- Legacy session types (being migrated to UnifiedWorkSession)
- Duplicate logger functions (logInfo, logWarn, logError, logDebug)

### How to Find Unused Exports
```bash
# Find all exports
grep -r "export" src/ --include="*.ts" --include="*.tsx" | grep -v "export default" > exports.txt

# Check each export for usage
while read line; do
  # Extract the export name and check if it's imported anywhere
  # This is a manual process but helps identify dead code
done < exports.txt
```

## TODO/FIXME Comments (8 total)

### Current TODOs
Run `grep -r "TODO\|FIXME\|HACK" src/` to get current list

### Categories
- Implementation TODOs - Features not yet built
- Refactoring TODOs - Code that needs cleanup
- Bug FIXMEs - Known issues to address
- Performance HACKs - Temporary workarounds

## Duplicate Implementations

### Logger Implementations
Multiple logger systems exist:
1. `/src/shared/logger.ts` - Unified logger (KEEP THIS)
2. `/src/logging/*` - Complex multi-transport system
3. `/src/renderer/utils/logger.ts` - Renderer-specific logger
4. Default functions (logInfo, etc.) - Being removed

### Scheduler Implementations
Multiple schedulers still in codebase:
1. UnifiedScheduler - New implementation (KEEP THIS)
2. SchedulingEngine - Old implementation
3. deadline-scheduler - Legacy code
4. flexible-scheduler - Legacy code

## Code Organization Issues

### Circular Dependencies
Potential circular dependency patterns to investigate:
- Store → Service → Store cycles
- Component → Hook → Store → Component cycles

### File Size Issues
Large files that should be split:
- `GanttChart.tsx` - Over 1000 lines
- `useTaskStore.ts` - Complex state management
- Database files - Mixed concerns

## Performance Concerns

### Unnecessary Re-renders
Components that may have performance issues:
- GanttChart - Heavy computation in render
- WorkflowGraph - Complex visualization
- Calendar components - Date calculations

### Missing Memoization
Places where useMemo/useCallback could help:
- Complex filter/sort operations
- Heavy computations in components
- Callback functions in dependency arrays

## Testing Gaps

### Components Without Tests
Critical components lacking test coverage:
- UnifiedScheduler (new code)
- UnifiedSchedulerAdapter
- Work capacity calculations
- Timeline components

### Integration Tests Needed
Areas needing integration tests:
- Scheduler → UI flow
- Work session tracking
- Database → Store synchronization

## Build Optimization Opportunities

### Bundle Size Concerns
- Check for duplicate dependencies
- Look for large libraries that could be replaced
- Consider code splitting opportunities

### Development Experience
- Slow TypeScript compilation
- Large number of files to check
- Test execution time increasing

---
*Generated: 2025-09-11*
*Next Cleanup Sprint: After scheduler unification complete*