# Cumulative Insights

## Session: 2025-08-31 (Latest)

### CRITICAL Testing Best Practices Learned

#### The Incremental Test Development Pattern
**Problem Identified**: Writing many tests at once without verification leads to:
- Massive test failures that are hard to debug
- Incorrect assumptions compounding across tests
- Wasted time fixing all tests when the root issue is in the mock setup

**Solution - Write ONE Test at a Time**:
1. Start with the simplest possible test case (e.g., empty state)
2. Run the test immediately and debug any failures
3. Understand exactly what data format the component expects
4. Only after it passes, add the next test building on what was learned
5. Each test reveals more about the component's actual behavior

**Key Discovery from GanttChart Testing**:
- Error: `timeStr.split is not a function` immediately revealed the data type issue
- `WorkBlock.startTime` and `endTime` must be strings like "09:00", NOT Date objects
- Component calls `db.getWorkPattern(dateStr)` for EACH day, not `getWorkPatterns()`
- Incremental approach found this in minutes vs hours of debugging multiple failures

**Correct Mock Pattern for GanttChart**:
```typescript
mockGetWorkPattern.mockImplementation((dateStr: string) => {
  return Promise.resolve({
    date: dateStr,
    blocks: [{
      id: `block-${dateStr}`,
      type: 'flexible',
      startTime: '09:00',  // MUST be string, not Date
      endTime: '17:00',    // MUST be string, not Date
      capacity: 480,
      usedCapacity: 0,
    }],
    meetings: []
  })
})
```

**Effectiveness**: Using incremental approach, achieved 23.05% test coverage (exceeding 20.45% requirement) with just 2 working tests instead of 17+ failing tests.

## Session: 2025-08-29

### BrainstormModal Clarification Flow Insights
- **Issue**: When user clicks "Regenerate with Clarification", UI wasn't updating to show regenerated workflow
- **Root Cause**: React wasn't detecting state changes because object reference wasn't changing
- **Pattern**: Modal was only updating local state, not persisting to database until "Use Edited Results" clicked
- **Solution**: Create new array references when updating state to trigger React re-renders
- **UX Improvement**: Added success messages with specific workflow/task names for better feedback
- **Validation**: Added check to ensure clarification text is provided before regeneration

### Critical Schedule Generation Bug Discovery
- **Issue**: Deadline scheduler was completely broken - not using work blocks at all
- **Root Cause**: `scheduleItems` function in deadline-scheduler.ts was a placeholder that just scheduled tasks sequentially
- **Impact**: Tasks with Monday deadlines were being scheduled for Sep 3rd, ignoring weekend availability
- **Pattern**: Weekend personal blocks were being created even without personal tasks
- **Solution**: 
  - Integrated flexible-scheduler properly to use work blocks
  - Only create weekend personal blocks when personal tasks exist
  - Add weekend work blocks for deadline-focused scheduling when urgent deadlines exist
- **Lesson**: Always verify that "simplified" implementations are actually temporary

## Session: 2025-08-19

### Critical Development Process Violations
- **NEVER push directly to main branch** - This is a fundamental violation of professional practices
- **Always create new feature branches** - Don't reuse old branches for new work
- **Follow proper PR workflow**: Feature branch → Push → PR → Review → Merge
- **Don't cherry-pick commits between branches** - This is poor practice

### Date/Time Handling Pattern Recognition
Multiple issues have emerged related to date/timestamp handling:
1. **Timeline View**: Sessions showing for wrong day
2. **Scheduling Debug Info**: Blocks showing as empty due to date mismatch
3. **Root Cause Pattern**: Variables tracking dates not being updated when context changes
4. **Solution Pattern**: Ensure date-related variables are updated whenever the date context changes

This suggests a systemic issue with date handling that needs architectural review.

### Scheduling Algorithm Insights
- **Critical Bug**: Scheduler wasn't backfilling earlier time slots
  - Always moved forward in time, never looked back at unused capacity
  - Fixed by changing `canFitInBlock` to always try from block start
  - Improved utilization from 25% to 68.8% (theoretical max without splitting)
- **Test Data Structure**: Must match exact interface expectations
  - Task uses `type: TaskType`, not `taskType: TaskType`
  - WorkBlock uses `id`, not `blockId`
  - Block capacity goes in `capacity` object, not directly on block
- **Remaining Optimization**: Task splitting needed for >70% utilization
  - Current algorithm treats tasks as atomic units
  - Need to implement splitting into 15-30 minute chunks
  - Would allow filling small gaps and achieving 90%+ utilization

## Session: 2025-08-18

### Session Summary
Implemented an innovative dual-view work logger combining a horizontal swim lane timeline (Gantt-style) with a circular 24-hour clock visualization. Both views support drag-and-drop interactions with real-time bidirectional synchronization.

### Key Learnings

#### UI/UX Innovation
- **Dual Representation Benefits**: Different users prefer different time visualizations
- **Bidirectional Sync**: Changes in one view immediately reflect in the other
- **Drag Interactions**: Intuitive manipulation works in both linear and circular coordinates

#### Implementation Patterns
- **Shared State Management**: Central state module (`SessionState.ts`) for consistency
- **SVG Arc Calculations**: Complex math for circular time representation
- **TypeScript Control Flow**: Strict mode requires careful null handling

#### Technical Achievements
- Created 4 new components with zero TypeScript/ESLint errors
- Implemented complex coordinate transformations (linear ↔ circular)
- Maintained existing WorkLoggerCalendar while adding new alternative

## Session: 2025-08-17

### Session Summary
Successfully fixed the CI/CD pipeline by consolidating scheduling engines and establishing a proper development workflow with branch protection and code review.

### Key Learnings

#### RLHF Training Effects
- AI assistants exhibit "sycophantic behavior" from reward hacking
- Tendency to prioritize perceived helpfulness over actual quality
- Results in: changing configs instead of fixing code, creating duplicates, skipping tests

#### Documentation Impact
- Hostile/aggressive documentation doesn't improve AI performance
- Constitutional AI principles with constructive guidance work better
- Emphatic markers (CRITICAL, emojis) help with parsing, not hostility

#### Effective Patterns
- **Test-First Enforcement**: Forces genuine test coverage
- **Search-First Development**: Prevents duplicate implementations
- **Atomic Commits**: Maintains clear development history
- **Single Source of Truth**: Reduces inconsistencies

### Common Pitfalls Discovered

1. **Creating Files Instead of Using Existing**
   - Created `known-issues.md` when `TECH_DEBT.md` existed
   - Solution: Always search first, document in existing files

2. **Running Scripts Without Testing**
   - Applied enum replacement to entire codebase without testing
   - Caused duplicate imports and syntax errors
   - Solution: Test on 1-2 files first, verify, then expand

3. **Ignoring Existing Patterns**
   - Three scheduling engines created independently
   - Multiple logger implementations
   - Solution: Search for similar functionality before implementing

4. **Reactive Fixes**
   - Fixed first error without understanding root cause
   - Created cascading issues
   - Solution: Understand the problem fully before fixing

### Performance Insights

#### TypeScript Strict Mode
- `exactOptionalPropertyTypes: true` catches many bugs
- Requires explicit null/undefined handling
- Worth the initial pain for long-term quality

#### Enum Migration
- Replacing string literals with enums is complex
- Tests may fail due to changed behavior
- Priority calculations may change

#### Voice Features
- IPC serialization of enums requires careful handling
- Amendment types need complete implementation
- Job context improves AI understanding significantly

### Workflow Improvements

#### From Research
1. **LCMP (Long-term Context Management Protocol)**: External memory through structured files
2. **Master Index Pattern**: Lean root docs with specialized imports
3. **Multi-Gate CI/CD**: Graduated quality gates catch AI-introduced issues
4. **Strategic Compaction**: Manual control at logical breakpoints

#### From Experience
1. Always backup database before migrations
2. Run typecheck after every significant change
3. Commit before any risky operation
4. Test UI manually after database changes

## Historical Context

### Beta Testing Discoveries (2025-08-13)
- 0 duration bug in workflows (fixed with `totalDuration`)
- WebM audio upload issues (fixed with proper API handling)
- Graph visualization breaking when editing
- AI sleep block auto-extraction implemented

### Migration History
- Unified task model migration (2025-08-14)
- Voice amendment system implementation (2025-08-15)
- Enum type safety migration (2025-08-17)

## Metrics Evolution

| Phase | TS Errors | ESLint Errors | Test Coverage |
|-------|-----------|---------------|---------------|
| Initial | 119 | 119 | ~20% |
| Post-Enum | 0 | 0 | ~40% |
| Target | 0 | 0 | 70% |

## Future Considerations

### Technical Debt Priority
1. **Rewrite Scheduling Tests** (High Priority)
   - deadline-scheduling.test.ts needs complete rewrite for unified scheduler
   - One test in dependency-scheduling.test.ts needs update
   - Need to test deadline pressure and async urgency in SchedulingEngine context
2. **Fix AI Amendment Dependency Editing** (High Priority)
   - Discovered during beta testing
   - Dependencies can't be edited via voice commands
3. **Update UI Components** (Medium Priority)
   - Some components may still use old scheduler patterns
   - Need to verify all use unified approach
4. **Consolidate Logger Implementations** (Low Priority)
   - Multiple logger implementations exist
5. **Complete Workflow Step Operations** (Low Priority)
   - Some amendment types not implemented

### Research-Based Improvements
1. Implement Mem0 for memory compression
2. Set up multi-gate CI/CD pipeline
3. Add semantic duplicate detection
4. Configure strategic compaction thresholds