# Next Session Plan (Post-PR #74)

## 🎯 Priority Order Based on PR #74 Retrospective

### 1. **Console.log Cleanup in src/** (High Priority)
**Current**: 76 instances remaining in source code
**Target**: 0 instances
**Approach**:
- Use grep to find all instances
- Group by file for systematic replacement
- Replace with appropriate logger.info/warn/error
- Test each change to ensure functionality preserved
**Estimated Time**: 2-3 hours

### 2. **Test Coverage Push to 35%** (High Priority)
**Current**: 30.65%
**Target**: 35%
**Strategy Based on PR #74 Learnings**:
- Target large untested files first:
  - src/renderer/components/ai/BrainstormModal.tsx (1,457 lines, 0%)
  - src/shared/scheduling-service.ts (654 lines, 20.48%)
  - src/shared/ai-service.ts (287 lines, 23.34%)
- Focus on error paths and edge cases
- Write integration tests for critical paths
**Estimated Time**: 4-6 hours

### 3. **Address Skipped Tests** (Medium Priority)
**Current**: 50 skipped tests
**Target**: <20 skipped tests
**Approach**:
- Review each skipped test
- Either fix the test or document in TECH_DEBT.md why it's skipped
- Priority on WorkLoggerCalendar tests (21 skipped)
**Estimated Time**: 2-3 hours

### 4. **Lint Warning Reduction** (Medium Priority)
**Current**: ~1,889 warnings
**Target**: <1,500 warnings
**Quick Wins**:
- Run `npm run lint --fix` for auto-fixable issues
- Address unused variables
- Fix missing useEffect dependencies
**Estimated Time**: 1-2 hours

### 5. **Review Unresolved Feedback** (Low Priority)
**Check**: feedback.json for any unresolved user feedback
**Action**: Prioritize any high-priority user issues
**Estimated Time**: 30 minutes review

## 📋 Pre-Session Checklist
- [ ] Read all files in /context/ directory
- [ ] Check git status and current branch
- [ ] Run tests to ensure clean starting point
- [ ] Review TECH_DEBT.md for any critical issues
- [ ] Check for any new PR comments

## 🚀 Quick Wins for Immediate Impact
1. **Run lint autofix**: `npm run lint --fix`
2. **Console.log batch replacement**: Start with files having most instances
3. **Test the largest untested file**: BrainstormModal.tsx for big coverage gain

## 📊 Success Metrics
By end of next session:
- Console.log in src/: 76 → 0 ✅
- Test coverage: 30.65% → 32% (incremental progress)
- Lint warnings: 1,889 → 1,500
- Skipped tests documented or fixed

## 💡 Lessons to Apply
From PR #74 retrospective:
- **Verify before claiming**: Always grep before saying "all X replaced"
- **Target large files for coverage**: Better ROI than many small files
- **Test-first for bug fixes**: Write failing test, then fix
- **Use growth mindset language**: Improves performance by 8-115%

## 🎉 Recent Wins to Build On
- Successfully deleted 10,650 lines of redundant code
- Exceeded main branch test coverage
- Fixed critical timezone and utilization bugs
- Established strong verification protocols

## 🚨 Specific Files to Focus On

### Console.log Hotspots (top offenders)
Based on audit, prioritize these files:
1. Check main/database.ts
2. Check shared/time-provider.ts
3. Check renderer components

### Test Coverage Opportunities
**Biggest untested files**:
1. src/renderer/components/ai/BrainstormModal.tsx (1,457 lines, 0%)
2. src/renderer/App.tsx (764 lines, 0%)
3. src/shared/scheduling-service.ts (654 lines, 20.48%)

### Skipped Test Clusters
1. WorkLoggerCalendar.test.tsx (21 tests)
2. voice-amendment-integration.test.tsx (8 tests)
3. Various unified-scheduler related skips

## Questions Resolved from PR #74
- ✅ Timezone handling: Use local time for user-facing, UTC for storage
- ✅ Scheduler unification: Complete! All using UnifiedScheduler
- ✅ Test coverage target: Must exceed main branch

## Long-term Vision Progress
- ✅ Complete scheduler unification (DONE!)
- ⏳ >70% test coverage (currently 30.65%)
- ⏳ <100 lint warnings (currently ~1,889)
- ⏳ Zero console.log in production code (76 remaining)

## Notes
The scheduler unification is complete! This is a massive architectural win that simplifies the codebase permanently. Now we can focus on quality improvements: better test coverage, cleaner code, and addressing remaining technical debt. The positive momentum from PR #74 sets us up for continued success.

---
*Updated: 2025-09-13 (Post PR #74)*
*Priority: Console cleanup → Test coverage → Quality improvements*