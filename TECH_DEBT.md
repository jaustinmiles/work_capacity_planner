# Technical Debt Inventory

## Critical Issues (Must Fix)

### 1. Incomplete Unified Task Model Migration
**Severity**: 🔴 Critical  
**Impact**: Causes ~30% of TypeScript errors, data inconsistency  
**Status**: Migration script exists but not executed  

**Problem**:
- Database maintains separate `Task` and `SequencedTask` tables
- TypeScript types expect unified model
- UI creates unified objects, database expects separate

**Solution**:
```bash
# 1. Backup database
npm run db:backup

# 2. Run migration
node scripts/migrate-unified-tasks.js

# 3. Update database service to remove SequencedTask queries
```

**Files to Update**:
- `src/main/database.ts` - Remove all SequencedTask methods
- `src/renderer/store/useTaskStore.ts` - Remove sequencedTasks state
- All UI components referencing SequencedTask

### 2. Property Naming Inconsistencies
**Severity**: 🟠 High  
**Impact**: 15+ TypeScript errors, confusing codebase  
**Status**: Systematic renaming required  

**Inconsistencies**:
| Current Mixed Usage | Should Be |
|-------------------|-----------|
| `focused` / `focusMinutes` | `focusMinutes` |
| `admin` / `adminMinutes` | `adminMinutes` |
| `duration` / `totalDuration` | `duration` |

**Files Affected**:
- All scheduling components
- Work block editors
- Database queries

## High Priority Issues

### 3. TaskStep Missing Required Fields
**Severity**: 🟠 High  
**Impact**: 6+ TypeScript errors  

**Missing Fields**:
- `taskId` - Not set during step creation
- `percentComplete` - Often undefined instead of 0
- `actualDuration` - Not initialized

**Fix Pattern**:
```typescript
const step: TaskStep = {
  id: generateId(),
  taskId: parentTaskId, // Must be set
  percentComplete: 0,    // Must initialize
  // ... other fields
}
```

### 4. Workflow UI Issues
**Severity**: 🟡 Medium  
**Impact**: Poor UX, confusing workflow editing  

**Problems**:
- Graph view embedded in edit modal (should be separate)
- No edit controls in graph visualization
- Dependency naming inconsistencies in edit mode
- Can't mark workflow sub-tasks complete (UI added but not wired)

### 5. Import Conflicts
**Severity**: 🟡 Medium  
**Impact**: Build errors, confusing imports  

**Example**:
```typescript
// src/renderer/store/useTaskStore.ts
import { WorkSession } from '@shared/types'  // Conflicts with local WorkSession type
```

## Medium Priority Issues

### 6. Array Type Inference
**Severity**: 🟡 Medium  
**Impact**: 13+ TypeScript errors  

**Problem**: Arrays initialized without types become `never[]`

**Bad**:
```typescript
const items = []
items.push(something) // Error!
```

**Good**:
```typescript
const items: ItemType[] = []
```

### 7. React Component Prop Issues
**Severity**: 🟡 Medium  
**Impact**: UI component errors  

**Issues**:
- Typography.Text doesn't accept `strong` prop
- Modal width should be in style prop
- BackgroundVariant missing expected values

### 8. Date/Time Type Confusion
**Severity**: 🟡 Medium  
**Impact**: Date handling errors  

**Problem**: Mixing Date objects and strings
- Database returns ISO strings
- UI expects Date objects
- dayjs usage inconsistent

## Low Priority Issues

### 9. Test Coverage
**Severity**: 🔵 Low  
**Impact**: Reduced confidence in changes  

**Missing Tests**:
- Unified task migration
- Complex scheduling scenarios
- Session management
- AI integration

### 10. Documentation Drift
**Severity**: 🔵 Low  
**Impact**: Confusion for new developers  

**Outdated Docs**:
- Architecture still shows dual task model
- Migration plan shows as "proposed" but partially done
- No documentation of actual vs expected behavior

## Code Smells

### Type Safety Issues
- Many `any` types throughout codebase
- Missing return type annotations
- Unsafe type assertions

### Component Organization
- Large components doing too much (GanttChart: 700+ lines)
- Business logic mixed with UI
- Inconsistent component structure

### Error Handling
- Silent failures in async operations
- Generic error messages
- No error recovery strategies

## Migration Path

### Phase 1: Database Migration (Week 1)
1. Complete unified task migration
2. Update all database queries
3. Remove obsolete tables

### Phase 2: Type Consistency (Week 1)
1. Fix property naming
2. Add missing required fields
3. Fix array type annotations

### Phase 3: UI Refinement (Week 2)
1. Extract graph view from modal
2. Wire up workflow step completion
3. Fix component prop issues

### Phase 4: Testing & Documentation (Week 2)
1. Add critical path tests
2. Update architecture docs
3. Document migration completion

## Metrics

| Metric | Current | Target |
|--------|---------|--------|
| TypeScript Errors | 49 | 0 |
| Code Coverage | ~20% | 70% |
| Documentation Currency | 60% | 95% |
| Component Complexity | High | Medium |

## Risk Assessment

**High Risk**:
- Data migration could lose information
- Breaking changes to UI during refactor

**Mitigation**:
- Comprehensive database backups
- Incremental changes with testing
- Feature flags for major changes

## Estimated Effort

| Task | Hours | Priority |
|------|-------|----------|
| Complete migration | 2-3 | Critical |
| Fix property names | 2-3 | High |
| Fix TaskStep creation | 1-2 | High |
| Fix UI components | 3-4 | Medium |
| Add tests | 4-6 | Low |
| Update docs | 2-3 | Low |
| **Total** | **14-21** | - |