# Dead Code & Cleanup Audit (2025-09-13)

## Console.log Usage Analysis

### Source Code (src/)
- **Count**: 76 instances (excluding tests)
- **Status**: Needs cleanup
- **Priority**: Medium - should migrate to unified logger

### Scripts Directory
- **Count**: 1,140 instances
- **Status**: Expected for CLI tools
- **Priority**: Low - scripts are meant to output to console

## TODO/FIXME Comments
- **Total**: 10 comments in src/
- **Priority**: Should review and either fix or document in TECH_DEBT.md

## Test Coverage Gaps

### Completely Untested Files (0% coverage)
Notable large files with no tests:
- src/renderer/App.tsx (764 lines)
- src/renderer/components/ai/BrainstormModal.tsx (1,457 lines)
- src/renderer/components/ai/TaskCreationFlow.tsx (390 lines)
- src/renderer/components/calendar/WeeklyCalendar.tsx (375 lines)
- src/logging/renderer/BrowserLogger.ts (128 lines)

### Low Coverage Files (<30%)
- src/shared/ai-service.ts: 23.34% (287 lines)
- src/shared/scheduling-service.ts: 20.48% (654 lines)
- src/main/database.ts: 35.28% (1,468 lines)

## Skipped Tests
- **Count**: 50 tests skipped
- **Locations**: 
  - voice-amendment-integration.test.tsx (8 skipped)
  - WorkLoggerCalendar.test.tsx (21 skipped)
  - Various others marked with test.skip()

## Lint Warnings
- **Count**: ~1,889 warnings
- **Common Issues**:
  - Unused variables
  - Missing dependencies in useEffect
  - Console.log usage
  - Type assertions

## Potential Dead Code After Scheduler Unification

### Deleted Files (Already Removed)
✅ flexible-scheduler.ts
✅ deadline-scheduler.ts  
✅ optimal-scheduler.ts
✅ scheduling-common.ts
✅ 20 associated test files

### Files That May Need Review
- Any imports referencing old schedulers (should be none)
- Adapter code that may no longer be needed
- Test utilities specific to old schedulers

## Recommendations

### Immediate Actions
1. **Console.log in src/**: Migrate remaining 76 instances to logger
2. **Review TODO comments**: Either fix or document in TECH_DEBT.md
3. **Address skipped tests**: Either fix or document why skipped

### Next Session Priorities
1. **Test Coverage**: Focus on large untested UI components
2. **Lint Warnings**: Run autofix and address high-impact warnings
3. **ai-service.ts**: Low coverage (23%) for important file

### Long-term Improvements
1. **UI Component Testing**: Need strategy for testing Arco components
2. **Scripts Cleanup**: Consider if console.log in scripts should stay
3. **Coverage Target**: Aim for 40% overall coverage

## Success Metrics to Track
- Console.log in src/: 76 → 0
- Test coverage: 30.65% → 40%
- Skipped tests: 50 → <20
- Lint warnings: 1,889 → <1,000

## Notes
The scheduler unification was a massive success, removing 10,650 lines of redundant code. The codebase is now significantly cleaner and more maintainable. The main remaining technical debt is around test coverage and completing the migration to the unified logger.