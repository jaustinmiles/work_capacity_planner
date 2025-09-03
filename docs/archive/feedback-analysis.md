# Feedback Analysis - Low-Hanging Fruit

## Overview
Total unresolved items: 15 (6 high, 8 medium, 1 low priority)

## Low-Hanging Fruit for Mega PR

### Easy Wins (Can implement quickly)

#### 1. **Load last used session by default** (MEDIUM priority)
- **Component**: Session management
- **Effort**: Low - Just need to save last session ID to localStorage/preferences
- **Implementation**: Add preference saving on session switch, load on app start

#### 2. **Add license to repo** (MEDIUM priority)  
- **Component**: Documentation
- **Effort**: Trivial - Just add LICENSE file
- **Recommendation**: Use AGPL-3.0 or custom license with non-commercial clause

#### 3. **Better UI presentation on AI brainstorm modal** (LOW priority)
- **Component**: ai/BrainstormModal
- **Effort**: Low-Medium - UI improvements and clear button
- **Implementation**: 
  - Add section dividers
  - Add "Clear Context" button
  - Better labels for non-technical users

#### 4. **Show all notes for workflow steps** (MEDIUM priority)
- **Component**: Workflow view
- **Effort**: Low-Medium - Aggregate and display existing data
- **Implementation**: Add "View All Notes" button that shows modal with all step notes

#### 5. **Hide pattern in log view fix** (HIGH priority - but seems mostly working)
- **Component**: dev/DevTools
- **Effort**: Low - Fix UI display issue with hidden patterns
- **Implementation**: Debug why hidden logs still show with eye icon

### Medium Effort (Need more work but doable)

#### 6. **Render scatter plot for Eisenhower Matrix** (MEDIUM priority)
- **Component**: tasks/EisenhowerMatrix  
- **Effort**: Medium - New visualization component
- **Implementation**: Use recharts or D3 for scatter plot with tooltips

#### 7. **Circadian rhythm visualization** (MEDIUM priority)
- **Component**: work-logger/WorkLoggerDualView
- **Effort**: Medium - New UI component with bezier curves
- **Implementation**: Add control points for cognitive peaks/dips

### High Effort (Should be separate PRs)

#### 8. **Periodic/recurring tasks** (HIGH priority)
- **Component**: Scheduler
- **Effort**: High - Major scheduler changes
- **Complex**: Need to handle repetition logic, UI changes, storage

#### 9. **Real time vs Optimal comparison** (HIGH priority)
- **Component**: Timeline view
- **Effort**: High - New feature with state management
- **Complex**: Freeze schedule, track actual vs planned

#### 10. **Split task functionality** (HIGH priority)
- **Component**: Task management
- **Effort**: High - Complex UI and logic
- **Complex**: Preserve dependencies, handle parallel/sequential

#### 11. **Time sinks functionality** (MEDIUM priority)
- **Component**: New feature
- **Effort**: High - New concept, UI, tracking
- **Complex**: New entity type, analytics

#### 12. **Web search in AI brainstorm** (MEDIUM priority)
- **Component**: AI service
- **Effort**: High - External API integration
- **Complex**: Web search API, rate limiting, parsing

#### 13. **Notes-based amendments** (MEDIUM priority)
- **Component**: Amendment system
- **Effort**: High - Complex integration
- **Complex**: Parse notes, generate amendments

#### 14. **UI improvements for timeline** (HIGH priority)
- **Component**: work-logger/WorkLoggerDualView
- **Effort**: Very High - Major UI overhaul
- **Complex**: Multiple sub-features, canvas-like scrolling

#### 15. **Duplicate tasks bug** (HIGH priority)
- **Component**: amendment-applicator
- **Effort**: Medium-High - Debug complex logic
- **Note**: Partially addressed in PR #45

## Recommended Mega PR Scope

Include these 7 items for quick wins:
1. ✅ Load last used session by default
2. ✅ Add license to repo
3. ✅ Better UI presentation on AI brainstorm modal
4. ✅ Show all notes for workflow steps
5. ✅ Hide pattern in log view fix
6. ✅ Render scatter plot for Eisenhower Matrix
7. ✅ Circadian rhythm visualization

These can be implemented in 1-2 days and will resolve 7/15 outstanding items (47% burndown).

## Next PRs
- PR 2: Periodic tasks + Split task functionality
- PR 3: Real time vs Optimal + Time sinks
- PR 4: Timeline UI overhaul
- PR 5: Web search + Notes amendments