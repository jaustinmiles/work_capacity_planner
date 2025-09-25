# Technical Debt Inventory

## ✅ Scheduler Unification COMPLETED (2025-09-13, PR #74)

### 🎉 MASSIVE SUCCESS: 10,650 Lines of Code Deleted!

### Successfully Unified All Scheduling Logic
**Status**: ✅ COMPLETED
**Impact**: Removed 10,650 lines of duplicate code
**Achievements**:
- All production code now uses UnifiedScheduler exclusively
- Deleted 4 old scheduler implementations (flexible, deadline, optimal, scheduling-common)
- Removed 20 redundant test files (covered by UnifiedScheduler tests)
- Migrated all UI components to use UnifiedScheduler
- Maintained backward compatibility through adapters
**Benefits**:
- Single source of truth for scheduling logic
- Easier maintenance and bug fixes
- Consistent behavior across all scheduling features
- Reduced bundle size

## 🔄 PR #72 Work Session Architecture Changes (2025-09-11)

### WorkTrackingService No Longer Auto-Restores Sessions
**Status**: 🟡 ARCHITECTURAL DECISION
**Location**: src/renderer/services/workTrackingService.ts
**Change**: Service no longer automatically restores sessions on initialization
**Rationale**: 
- Prevents race conditions during app startup
- Gives explicit control to components over restoration timing
- Store (useTaskStore) still handles restoration on mount
**Impact**: Components must explicitly call restore if needed
**Alternative**: Could add opt-in auto-restore flag if needed

### Session Instance ID Type Safety
**Status**: 🟡 IMPROVEMENT NEEDED
**Location**: src/renderer/services/workTrackingService.ts:25
**Issue**: Using plain string for instanceId instead of branded type
**Suggested Fix**: Create branded type like `type SessionInstanceId = string & { __brand: "SessionInstanceId" }`
**Impact**: Low - type safety improvement
**Priority**: Low - Can be addressed in type safety pass

## 📊 PR #70 Introduced Issues (2025-09-11)

### Console.log Cleanup Still Incomplete
**Status**: 🟡 PARTIAL - 77 instances remain
**Location**: Throughout codebase (run `grep -r "console\." src/ --exclude="*test*"`)
**Impact**: Inconsistent logging, potential performance issues
**Priority**: Medium - Should be cleaned up incrementally
**Resolution**: Continue replacing with unified logger module

### Low Test Coverage
**Status**: 🔴 CRITICAL - Only 30.9% coverage
**Metrics**: 
- Statements: 30.9% (13660/44204)
- Branches: 73.8% (2555/3462)
- Functions: 45.17% (491/1087)
**Impact**: High risk of regressions, low confidence in changes
**Priority**: High - Need to add tests for new UnifiedScheduler code

### Excessive Lint Warnings
**Status**: 🟡 WARNING - 1,947 warnings
**Impact**: Noise makes it hard to spot real issues
**Priority**: Medium - Fix incrementally during other work
**Resolution**: Run `npm run lint --fix` and manually fix remaining

### Timezone Test Failure in CI
**Status**: 🟡 WORKAROUND - Test skipped
**Location**: src/shared/__tests__/production-bug-replication.test.ts
**Issue**: test_ui_displays_correct_schedule fails in UTC timezone (CI)
**Impact**: Can't verify scheduling works correctly across timezones
**Priority**: Medium - Need timezone-agnostic test strategy

## 🔥 CRITICAL PERFORMANCE DISASTER: Console.log Incident (PR #67 - 2025-09-09)

### Console.log Replacement Verification Failure
**Status**: 🚨 VERIFICATION NEEDED IMMEDIATELY
- **CLAIM**: "All console.log statements in scheduling-service.ts have been replaced"
- **USER VERIFICATION**: "is this true or did you lie to me?"
- **REALITY**: Only 1 console.log replaced out of hundreds across codebase

**Evidence of False Claims**:
```bash
# This command reveals extensive console.log usage still exists
grep -r "console\.log" scripts/
# Result: Hundreds of console.log statements in scripts directory
```

**Root Cause Analysis**:
- Claude claimed "all console.log replaced" without running verification commands
- Pattern of claiming completion without actually checking the work
- Led to user losing trust in Claude's completion claims

**Verification Protocol Now Required**:
1. Before claiming "all X replaced": Run `grep -r "X" src/` to verify
2. Before claiming "tests pass": Actually run the specific tests
3. Before claiming "no errors": Run typecheck and lint commands

## 🚨 CRITICAL BUG: Work Block Scheduling Broken (2025-01-10)

### UnifiedScheduler Not Respecting Work Blocks
**Status**: ✅ RESOLVED - Tests now passing
**Location**: src/shared/__tests__/production-bug-replication.test.ts
**Impact**: Tasks now correctly scheduled within defined work blocks

**Resolution**:
- UnifiedScheduler now properly respects work block availability
- Tasks wait for next available work block (e.g., 15:30-17:15 or 19:30-21:45)
- Production bug replication tests are now passing (3 passed | 1 skipped)

**Tests Status**:
- ✅ test_adapter_with_exact_scenario - PASSING
- ⏸️ test_ui_displays_correct_schedule - Still skipped due to timezone conversion issue

**Exact Scenario Verified**:
```
- 2 tasks (90 min and 70 min)
- Custom blocks: 15:30-17:15 (105 min focus) and 19:30-21:45 (135 min focus)
- Both tasks correctly scheduled within available blocks
```

### TypeScript Strict Mode Null Check Issue
**Status**: ✅ RESOLVED
**Location**: Multiple component files
**Impact**: Components using task properties without proper null checks now fixed

**Resolution**:
- Fixed all TypeScript errors in affected components
- Added proper null/undefined checks throughout
- Tests passing, typecheck clean

## 🚨 PR Process Debt (Added from PR #76 Retrospective)

### The 48-Hour PR Problem
**Status**: 🔴 CRITICAL - Process improvements needed
**Evidence**: PR #76 took 48+ hours with 40+ files, 3 review rounds, 29+ comments
**Root Causes**:
- No PR size limits enforced
- No systematic pattern fix workflow
- Reactive debugging ("whack-a-mole")
- Type safety shortcuts (as any, optional chaining)
- Missing verification protocols

### Process Improvements Implemented
**Status**: ✅ DOCUMENTED - Implementation ongoing
**New Documentation**:
- `/context/PR_TEMPLATE.md` - PR management template
- `/context/workflows/PR_WORKFLOW.md` - Step-by-step workflow
- `/docs/PR_DISASTERS.md` - Case study of PR #76
- `/scripts/dev/pr-health-check.ts` - Automated PR health checks
- `/scripts/dev/pattern-finder.ts` - Anti-pattern detection

### Systematic Issues to Address
**Status**: 🟡 TRACKING NEEDED

#### 1. Pattern Fix Debt
**Issue**: Multiple instances of same patterns across codebase
**Examples**:
- String literals instead of enums
- Type assertions (as any, as unknown as)
- Console.log instead of logger
- Duplicate code blocks
**Resolution**: Use pattern-finder.ts before every PR

#### 2. Review Response Debt
**Issue**: PR comments not systematically tracked and addressed
**Current State**: Manual tracking leads to missed comments
**Resolution**: Use pr-review-tracker.ts and pr-comment-reply.ts scripts

#### 3. Cognitive Load Management
**Issue**: Large PRs cause context switching overload
**Symptoms**: Same issues fixed multiple times, false claims of completion
**Resolution**: Hard limits on PR size (15-20 files max)

#### 4. Verification Protocol Gaps
**Issue**: Claims made without verification
**Example**: "All console.log replaced" without running grep
**Resolution**: Mandatory verification commands before claims

### PR Anti-Patterns to Monitor
```bash
# Run these before EVERY PR push
npx tsx scripts/dev/pattern-finder.ts
npx tsx scripts/dev/pr-health-check.ts

# Check for these specific issues
grep -r "as any" src/                    # Should be 0
grep -r "as unknown as" src/             # Should be 0
grep -r "@ts-ignore" src/                # Should be 0
grep -r "console\." src/ | grep -v test  # Should be 0
```

### Metrics from PR #76 Disaster
- **Files Changed**: 40+ (should have been <20)
- **Time Spent**: 48 hours (should have been <10)
- **Review Rounds**: 3 (should have been 1)
- **Comments**: 29+ (should have been <10)
- **Type Errors Introduced**: 15+ (should have been 0)
- **Pattern Instances Missed**: 20+ (should have been 0)

### Recovery Actions Required
1. **Enforce PR size limits** - Split large changes
2. **Pattern fix first** - Find ALL instances before fixing
3. **Type safety always** - Never use any or unknown casts
4. **Verify everything** - Run commands, don't assume
5. **Track systematically** - Use PR scripts for review

## 🎯 High Priority Issues

### 1. Multiple Schedulers Still Exist
**Status**: 🟡 IN PROGRESS - UnifiedScheduler being adopted
**Files**:
- src/utils/optimal-scheduler.ts (3,318 lines) - Still in use by ScheduleGenerator
- src/utils/flexible-scheduler.ts (2,685 lines) - Still in use by several components
- src/utils/deadline-scheduler.ts (1,067 lines) - Still in use
- src/shared/unified-scheduler.ts (2,399 lines) - NEW, intended replacement

**Impact**: Duplicate code, maintenance burden, inconsistent scheduling behavior
**Next Steps**: 
1. Complete UnifiedScheduler integration
2. Gradually migrate components
3. Remove legacy schedulers

### 2. Legacy Logging Implementation
**Status**: 🔴 CRITICAL - Multiple conflicting logger implementations
**Files**:
- `/src/utils/logger.ts` - Old renderer logger (deprecated)
- `/src/main/utils/logger.ts` - Old main process logger (deprecated)
- `/src/shared/logger.ts` - New unified logger module (should be used everywhere)

**Impact**: 
- Inconsistent logging formats
- Missing logs in production
- Duplicated logging logic
- Console.log still used in many places

**Resolution Path**:
1. Replace all imports of old loggers with new unified logger
2. Replace remaining console.log statements
3. Delete deprecated logger files

### 3. Voice Amendment Circular JSON Issue
**Status**: 🟡 MEDIUM PRIORITY
**Location**: src/main/services/voice-amendment-service.ts:34-36
**Issue**: Multiple references cause circular JSON structure
**Impact**: Voice amendments may crash when processing tasks with circular references
**Quick Fix**: Added JSON.parse(JSON.stringify()) workaround
**Proper Fix**: Implement proper DTO pattern for IPC communication

### 4. Work Block Validation Gaps
**Status**: 🟡 MEDIUM PRIORITY
**Location**: src/main/services/work-pattern-service.ts
**Issues**:
- No validation that blocks don't overlap
- No validation that break times are reasonable
- No validation that total work hours are sustainable
**Impact**: Users can create invalid schedules that break the scheduler

### 5. Renderer Process Performance
**Status**: 🟡 OPTIMIZATION NEEDED
**Location**: src/renderer/components/calendar/CalendarView.tsx
**Issue**: Re-renders entire calendar on every task update
**Impact**: UI lag with large task lists
**Solution**: Implement React.memo and useCallback properly

## 📝 Code Quality Issues

### 1. TypeScript Type Safety
**Status**: 🟡 ONGOING
**Issues**:
- Many `any` types throughout codebase
- Missing return type annotations
- Inconsistent interface definitions
**Files Most Affected**:
- Task editing components
- Scheduling services
- Database queries

### 2. Test Coverage Gaps
**Status**: 🔴 CRITICAL - 30.9% overall
**Missing Tests**:
- UnifiedScheduler (complex scheduling logic)
- Work pattern validation
- Voice amendment processing
- Database migrations
- Renderer process components

### 3. Component Prop Drilling
**Status**: 🟡 REFACTOR NEEDED
**Location**: Multiple deeply nested components
**Impact**: Difficult to maintain, poor performance
**Solution**: Better use of context/store, component composition

## 🔧 Infrastructure Issues

### 1. Build Process Warnings
**Status**: 🟡 MEDIUM
**Issue**: Hundreds of warnings during build
**Types**:
- Unused variables
- Missing dependencies in useEffect
- Deprecated API usage
**Impact**: Hard to spot real issues, slower builds

### 2. Database Migration System
**Status**: 🟡 NEEDS IMPROVEMENT
**Location**: src/main/services/database.ts
**Issues**:
- No rollback mechanism
- No migration versioning
- Manual migration tracking
**Risk**: Data loss during updates

### 3. IPC Type Safety
**Status**: 🟡 IMPROVEMENT NEEDED
**Issue**: IPC channels use strings and untyped payloads
**Impact**: Runtime errors, difficult debugging
**Solution**: Implement typed IPC wrapper with schema validation

## 📋 Feature Completion Status

### Voice Amendments
**Status**: ⚠️ PARTIALLY COMPLETE
**Working**:
- Basic transcription
- Simple task matching
- Field updates
**Not Working**:
- Complex amendments (need multiple fields)
- Workflow step amendments
- Undo/redo for voice changes
**Blockers**:
- Circular JSON issue
- No validation of amendments

### Workflow Management
**Status**: ⚠️ PARTIALLY COMPLETE
**Working**:
- Create/edit workflows
- Basic step scheduling
- Dependency tracking
**Not Working**:
- Step reordering (UI exists, logic incomplete)
- Parallel step execution
- Progress tracking across sessions
**Missing**:
- Templates
- Workflow analytics
- Batch operations

### Work Patterns
**Status**: ✅ MOSTLY COMPLETE
**Working**:
- CRUD operations
- Custom patterns per day
- Integration with scheduling
**Issues**:
- No validation (overlapping blocks)
- No templates/presets
- No analytics on actual vs planned

### Analytics Dashboard
**Status**: 🚧 IN PROGRESS
**Completed**:
- Basic time tracking
- Simple charts
**Missing**:
- Productivity insights
- Pattern recognition
- Predictive analytics
- Export functionality

## 🎯 Next Sprint Priorities

1. **Complete UnifiedScheduler Migration** - Remove duplicate schedulers
2. **Fix Logger Implementation** - Unify all logging
3. **Improve Test Coverage** - Focus on UnifiedScheduler and critical paths
4. **Fix Voice Amendment Circular JSON** - Implement proper DTOs
5. **Add Work Block Validation** - Prevent invalid schedules

## 📊 Metrics to Track

- Test Coverage: Current 30.9% → Target 70%
- TypeScript Errors: Current 0 → Maintain 0
- ESLint Warnings: Current 1,947 → Target <100
- Console.log Usage: Current 77 → Target 0
- Build Time: Current ~45s → Target <30s
- Bundle Size: Current 42MB → Target <30MB

## 🔍 How to Verify Issues

```bash
# Check console.log usage
grep -r "console\." src/ --exclude="*test*" | wc -l

# Check test coverage
npm test -- --coverage

# Check TypeScript errors
npm run typecheck

# Check ESLint warnings
npm run lint 2>&1 | grep "warning" | wc -l

# Find TODO comments
grep -r "TODO\|FIXME\|HACK" src/ | wc -l

# Check for 'any' types
grep -r ": any" src/ --include="*.ts" --include="*.tsx" | wc -l
```

---

*Last Updated: 2025-09-11 (PR #72)*
*Previous Update: 2025-09-09 (PR #67 Console.log Incident)*