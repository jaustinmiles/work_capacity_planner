# Code Cleanup Recommendations

## Dead Code to Remove

### 1. Completed Migration Scripts
**Files to archive/delete:**
- `scripts/migrate-unified-tasks.js` - Migration complete
- `scripts/complete-unified-migration.js` - Migration complete

**Action:** Move to an `archive/` folder or delete since migration is complete

### 2. Unused Variables (201 instances)
Most common patterns:
- Destructured variables not used
- Error objects in catch blocks not logged
- Import statements for types only (should use `import type`)

**Quick wins:**
- Add underscore prefix for intentionally unused vars: `_unusedVar`
- Remove truly unused imports
- Log error objects in catch blocks

### 3. TypeScript `any` Types (124 instances)
**Priority areas:**
- `src/main/database.ts` - Several `any` types in method signatures
- Event handlers using `any` for event types
- API response types

**Action:** Create proper types for:
- Database query results
- IPC message payloads
- API responses

## Refactoring Opportunities

### 1. Extract Constants
**Hardcoded strings found:**
- Task types: 'focused', 'admin', 'blocked-time'
- Status values: 'pending', 'in_progress', 'completed'
- Work block types

**Action:** Create enums in `src/shared/constants.ts`:
```typescript
export enum TaskType {
  FOCUSED = 'focused',
  ADMIN = 'admin',
  BLOCKED = 'blocked-time'
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed'
}
```

### 2. Consolidate Duplicate Logic
**Pattern duplication found in:**
- Time calculation logic in multiple components
- Date formatting scattered across files
- Task priority calculation

**Action:** Create utility modules:
- `src/shared/utils/time.ts` - Centralize time calculations
- `src/shared/utils/formatting.ts` - Date/time formatting
- `src/shared/utils/priority.ts` - Priority calculations

### 3. Component Decomposition
**Large components that should be split:**
- `TaskList.tsx` (400+ lines) - Extract TaskFilters, TaskActions
- `GanttChart.tsx` (300+ lines) - Extract TimeAxis, TaskBars
- `SequencedTaskForm.tsx` (500+ lines) - Extract StepForm, DependencySelector

### 4. Test Coverage Gaps
**Untested modules:**
- `/src/renderer/components/ai/*` - No tests
- `/src/renderer/components/calendar/*` - No tests
- `/src/main/ai-service.ts` - No tests

**Action:** Add at least smoke tests for each component

## Performance Optimizations

### 1. Memoization Opportunities
**Components re-rendering unnecessarily:**
- TaskItem in TaskList
- Individual steps in SequencedTaskView
- Timeline blocks in GanttChart

**Action:** Add React.memo and useMemo where appropriate

### 2. Database Query Optimization
**N+1 query patterns found:**
- Loading tasks then loading steps separately
- Multiple queries for work sessions

**Action:** Use Prisma includes more effectively

### 3. Bundle Size
**Large dependencies to evaluate:**
- Arco Design - Consider tree shaking
- dayjs - Already lightweight, good choice
- Prisma client - Necessary for database

## Code Style Consistency

### 1. Naming Conventions
**Inconsistencies found:**
- Mix of `focusMinutes` and `focused` for capacity
- `taskId` vs `task_id` in different contexts
- `actualDuration` vs `actualMinutes`

**Action:** Standardize on:
- `focusMinutes/adminMinutes` for capacity
- camelCase for all JavaScript/TypeScript
- Consistent property names across models

### 2. File Organization
**Suggested reorganization:**
```
src/
├── shared/
│   ├── constants/     # All enums and constants
│   ├── types/         # TypeScript interfaces
│   ├── utils/         # Utility functions
│   └── hooks/         # Shared React hooks
├── main/
│   ├── services/      # Business logic
│   ├── handlers/      # IPC handlers
│   └── database/      # Database operations
└── renderer/
    ├── components/    # UI components
    ├── hooks/         # Component-specific hooks
    ├── store/         # State management
    └── utils/         # Renderer-specific utils
```

## Immediate Actions (Quick Wins)

1. **Delete migration scripts** - 5 minutes
2. **Add underscore to unused vars** - 15 minutes
3. **Create constants file with enums** - 20 minutes
4. **Fix lint errors in critical files** - 30 minutes

## Medium-term Actions

1. **Replace `any` types with proper types** - 2-3 hours
2. **Extract duplicate logic to utils** - 2-3 hours
3. **Add basic test coverage** - 3-4 hours
4. **Split large components** - 3-4 hours

## Long-term Improvements

1. **Full TypeScript strict compliance**
2. **90%+ test coverage**
3. **Performance optimization for 1000+ tasks**
4. **Component library documentation**