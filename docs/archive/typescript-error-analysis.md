# TypeScript Error Analysis Report

## Executive Summary
As of 2025-08-13, the project has **49 TypeScript errors** with strict settings enabled. The root cause is an **incomplete migration from a dual task model (Task + SequencedTask) to a unified model**. The database schema still maintains separate tables while the TypeScript types attempt to unify them, causing widespread type inconsistencies.

## Error Distribution by Type

| Error Code | Count | Description | Root Cause |
|------------|-------|-------------|------------|
| TS2339 | 14 | Property does not exist | Missing/renamed properties |
| TS2345 | 13 | Type assignment error | Type incompatibilities |
| TS2322 | 9 | Type not assignable | Structural differences |
| TS2739 | 6 | Missing properties | Incomplete object initialization |
| TS2353 | 2 | Unknown property | Property name changes |
| Others | 5 | Various | Mixed issues |

## Core Issues Identified

### 1. Incomplete Task Model Migration (Critical)
**Problem**: The project attempted to unify `Task` and `SequencedTask` but only completed the TypeScript side, not the database side.

**Evidence**:
- `prisma/schema.prisma` still has separate `Task` and `SequencedTask` tables
- `src/shared/sequencing-types.ts` defines `SequencedTask` as a type alias: `Task & { steps: TaskStep[], hasSteps: true }`
- Database service still queries both tables separately
- UI components expect unified types but receive separate database models

**Impact**: ~30% of all errors stem from this mismatch

### 2. Property Naming Inconsistencies (High)
**Problem**: Different layers use different property names for the same concept.

**Examples**:
- Capacity: `focused/admin` vs `focusMinutes/adminMinutes`
- Duration: `duration` vs `totalDuration`
- Time tracking: `WorkSession` vs `StepWorkSession` (latter doesn't exist in unified model)

**Files Affected**:
- `src/renderer/components/timeline/GanttChart.tsx`
- `src/renderer/components/settings/WorkScheduleModal.tsx`
- `src/renderer/components/settings/VoiceScheduleModal.tsx`

### 3. TaskStep Missing Required Properties (High)
**Problem**: TaskStep objects created in UI don't include all required properties.

**Missing Properties**:
- `taskId`: Required by type definition but not set during creation
- `percentComplete`: Required but often omitted
- `actualDuration`, `startedAt`, `completedAt`: Optional but expected

**Files Affected**:
- `src/renderer/components/tasks/SequencedTaskEdit.tsx`
- `src/renderer/components/tasks/SequencedTaskForm.tsx`
- `src/renderer/components/tasks/TestWorkflowCreator.tsx`

### 4. Array Push Type Errors (Medium)
**Problem**: Arrays initialized without proper typing default to `never[]`

**Pattern**: 
```typescript
const items = []  // Type: never[]
items.push(something)  // Error: can't assign to 'never'
```

**Solution**: Properly type arrays at initialization
```typescript
const items: ItemType[] = []
```

**Files Affected**:
- `src/shared/scheduling-service.ts`
- `src/renderer/components/timeline/GanttChart.tsx`

### 5. React/Arco Design Component Props (Low)
**Problem**: Using incorrect prop names or types for UI components

**Examples**:
- `Typography.Text` doesn't accept `strong` prop
- `BackgroundVariant` doesn't include `"dots"`
- Modal `width` should be in `style` prop

## Architecture Discrepancies

### Database vs TypeScript Types

| Database (Prisma) | TypeScript | Status |
|-------------------|------------|--------|
| `Task` table | `Task` interface | ✅ Aligned |
| `SequencedTask` table | Type alias for `Task` | ❌ Misaligned |
| `TaskStep.sequencedTaskId` | `TaskStep.taskId` | ❌ Misaligned |
| `WorkSession` + `StepWorkSession` | Just `WorkSession` | ❌ Partially migrated |

### Data Flow Issues

1. **Create Flow**: UI creates unified Task → Database expects separate tables
2. **Read Flow**: Database returns separate models → UI expects unified
3. **Update Flow**: Mixed expectations cause property mismatches

## Recommended Fix Strategy

### Phase 1: Complete Database Migration (Priority 1)
1. Run the unified task migration to merge SequencedTask into Task table
2. Update all database queries to use single Task table
3. Remove SequencedTask references from database service

### Phase 2: Fix Property Naming (Priority 2)
1. Standardize on single naming convention:
   - Use `focusMinutes/adminMinutes` everywhere (not `focused/admin`)
   - Use `duration` consistently (not `totalDuration`)
2. Update all components to use consistent names

### Phase 3: Fix TaskStep Creation (Priority 3)
1. Ensure all TaskStep objects include required fields
2. Set `taskId` when creating steps
3. Initialize `percentComplete` to 0

### Phase 4: Fix Type Annotations (Priority 4)
1. Properly type all array initializations
2. Fix React component prop types
3. Remove references to non-existent properties

## Files Requiring Most Attention

1. **src/main/database.ts** - Complete migration to unified model
2. **src/renderer/components/tasks/SequencedTaskEdit.tsx** - Fix TaskStep creation
3. **src/renderer/components/timeline/GanttChart.tsx** - Fix capacity property names
4. **src/renderer/store/useTaskStore.ts** - Remove StepWorkSession references
5. **src/shared/scheduling-service.ts** - Fix array type annotations

## Technical Debt Items

1. **Database Migration**: Incomplete unified task model migration
2. **Type Safety**: Many `any` types and missing type annotations
3. **Component Separation**: Graph view should not be in edit modal
4. **Import Organization**: Circular dependencies and conflicting imports
5. **Test Coverage**: Many components lack tests

## Metrics

- **Total Errors**: 49
- **Files Affected**: 15
- **Critical Issues**: 2 (migration, property naming)
- **Estimated Fix Time**: 4-6 hours for systematic fix
- **Risk Level**: Medium (data migration required)

## Next Steps

1. **Backup database** before any migration
2. **Complete unified task migration** in database
3. **Update database service** to use unified model
4. **Fix property naming** systematically
5. **Run typecheck after each phase** to verify progress