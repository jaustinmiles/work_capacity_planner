# Cumulative Insights

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