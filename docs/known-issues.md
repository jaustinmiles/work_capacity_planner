# Known Issues & Future Tasks

## Current Issues (as of 2025-08-17)

### 1. AI Amendment - Dependency Editing Not Working
- **Issue**: Dependency editing through AI voice amendments is not functioning properly
- **Impact**: Users cannot update task/workflow dependencies via voice commands
- **Workaround**: Edit dependencies manually through the UI
- **Priority**: Medium
- **Related files**: 
  - `/src/renderer/utils/amendment-applicator.ts`
  - `/src/shared/ai-service.ts`

### 2. WorkBlock Type Inconsistency
- **Issue**: WorkBlock still uses string literals (`'focused' | 'admin' | 'mixed' | 'personal'`) instead of TaskType enum
- **Impact**: Type inconsistency requiring casts in some places
- **Workaround**: Using type casts where needed
- **Priority**: Low (architectural refactor needed)
- **Related files**:
  - `/src/shared/work-blocks-types.ts`
  - `/src/renderer/utils/flexible-scheduler.ts`

### 3. Mixed TaskType Patterns in Database Service
- **Issue**: Some database methods still have remnants of mixed patterns (e.g., `'admin' | TaskType.Focused`)
- **Impact**: Requires type casting in amendment-applicator
- **Workaround**: Using `as any` cast with TODO comment
- **Priority**: Medium
- **Related files**:
  - `/src/main/database.ts` 
  - `/src/renderer/services/database.ts`
  - `/src/renderer/utils/amendment-applicator.ts` (line 157)

## Completed Fixes (2025-08-17)
- ✅ Replaced all string literals with TaskType enum (119 → 0 TypeScript errors)
- ✅ Fixed duplicate imports across 57+ files
- ✅ Resolved ExtractedTask type conflicts
- ✅ Fixed logger scope issues
- ✅ Added window.electron typing for renderer process
- ✅ ESLint: 0 errors
- ✅ TypeScript: 0 errors

## Future Improvements
1. Complete migration of WorkBlock to use TaskType enum
2. Unify the three scheduling engine implementations discovered during refactoring
3. Consolidate duplicate logger implementations
4. Add comprehensive test coverage for AI amendment functionality
5. Implement proper error boundaries for AI operations