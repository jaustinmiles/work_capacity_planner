# Next Session Plan

## Priority Order (Based on PR #70 Retrospective)

### 1. 🔴 Critical: Fix Timezone Test
**Task**: Fix the skipped production-bug-replication test
**Location**: `src/shared/__tests__/production-bug-replication.test.ts`
**Issue**: test_ui_displays_correct_schedule fails in CI (UTC) but passes locally (PDT)
**Approach**:
- Create timezone-agnostic assertions
- Or mock Date/timezone consistently
- Ensure test passes in both environments
**Success Criteria**: Test passes in both local and CI environments

### 2. 🟡 High: Improve Test Coverage for UnifiedScheduler
**Task**: Add comprehensive tests for new scheduler code
**Current Coverage**: 30.9% (unacceptably low)
**Target**: >40% for next PR, >50% within 3 PRs
**Focus Areas**:
- UnifiedScheduler core logic
- UnifiedSchedulerAdapter transformations
- Work block capacity calculations
- Priority ordering logic
**Success Criteria**: Coverage increases by at least 5%

### 3. 🟡 Medium: Console.log Cleanup Sprint
**Task**: Replace remaining 77 console statements with logger
**Priority Files**:
1. `src/main/database.ts`
2. `src/shared/time-provider.ts`
3. `src/shared/unified-scheduler-adapter.ts`
4. `src/renderer/utils/scheduling-common.ts`
**Approach**: File-by-file replacement with proper logger categories
**Success Criteria**: <20 console statements remaining

### 4. 🟡 Medium: Lint Warning Reduction
**Task**: Reduce lint warnings from 1,947 to <1,500
**Quick Wins**:
```bash
npm run lint -- --fix
npx eslint src/ --fix --rule 'no-unused-vars: error'
npx eslint src/ --fix --rule 'prefer-const: error'
```
**Manual Fixes**: Address any type usage and React hook dependencies
**Success Criteria**: <1,500 warnings

### 5. 🟢 Low: Continue Scheduler Unification
**Task**: Migrate next component to UnifiedScheduler
**Candidates**:
- GanttChart (already partially migrated)
- Timeline components
- Calendar views
**Approach**: One component per PR as decided
**Success Criteria**: One more component fully migrated

## Pre-Session Checklist

Before starting the next session, MUST DO:
- [ ] Read ALL files in `/context/` directory
- [ ] Check latest `feedback.json` for user feedback
- [ ] Review `TECH_DEBT.md` for priority changes
- [ ] Verify no unresolved PR comments with `npx tsx scripts/pr/pr-review-tracker.ts`
- [ ] Run `npm run typecheck` to ensure clean baseline
- [ ] Run `npm run lint | grep "error"` to ensure no errors
- [ ] Check CI status for any new failures

## Session Success Metrics

By end of next session, achieve:
- [ ] Timezone test fixed and passing in CI
- [ ] Test coverage increased by at least 5%
- [ ] Console.log instances reduced by at least 50 (to <30)
- [ ] Lint warnings reduced by at least 400 (to <1,500)
- [ ] All changes have proper tests
- [ ] Documentation updated in `/context/` files

## Potential Blockers to Address

### Technical Blockers
- Timezone test may require significant refactoring
- Test coverage tools may need configuration
- Some console.logs may be in third-party code

### Process Blockers
- Long CI cycle times slow down iteration
- Large codebase makes changes risky
- Multiple incomplete refactorings create confusion

## Questions for User

Before starting major work:
1. Is fixing the timezone test the highest priority?
2. Should we focus on test coverage or technical debt cleanup?
3. Which component should be migrated to UnifiedScheduler next?
4. Any specific areas of concern from production use?

## Long-term Vision Alignment

Working towards:
- Complete scheduler unification (all components using UnifiedScheduler)
- >70% test coverage
- <100 lint warnings
- Zero console.log in production code
- Clean, maintainable codebase

## Notes from PR #70

### What Worked Well
- PR review scripts streamlined the process
- Incremental migration strategy is sustainable
- Type safety improvements caught real bugs

### What to Improve
- Add tests DURING development, not after
- Fix lint warnings incrementally during other work
- Verify claims with grep before stating complete
- Create timezone-agnostic tests from the start

---
*Created: 2025-09-11*
*For Session: Next development session*
*Priority: Fix tests → Improve coverage → Clean up tech debt*