# Technical Decisions & Rationale

## Architecture Decisions

### Unified Task Model (2025-08-14)
**Decision**: Merge Task and SequencedTask into single database table
**Rationale**: 
- Simplifies data model
- Reduces code duplication
- Maintains backward compatibility through formatting layer
**Implementation**: Tasks with `hasSteps: true` are workflows

### Enum-Based Type Safety (2025-08-17)
**Decision**: Replace all string literals with TypeScript enums
**Rationale**:
- Compile-time type safety
- Single source of truth for constants
- Prevents typo-based bugs
**Location**: `/src/shared/enums.ts`

### Scoped Logger Architecture
**Decision**: Use scoped loggers (ui, ai, store, scheduler)
**Rationale**:
- Better log organization
- Easier debugging by component
- Consistent logging patterns
**Note**: Multiple implementations exist - needs consolidation

### IPC Through Preload Script
**Decision**: All database operations go through preload script
**Rationale**:
- Security (context isolation)
- Type safety
- Clear separation of concerns
**Pattern**: Renderer → Preload → Main Process → Database

### React 19 with Arco Design
**Decision**: Use Arco Design component library
**Rationale**:
- Professional UI components
- Comprehensive design system
- Good TypeScript support
**Note**: Some React 19 compatibility warnings exist

## Code Patterns

### Test-First Development
**Decision**: Write failing tests before implementation
**Rationale**:
- Ensures tests are valid
- Prevents implementation-specific tests
- Improves code quality

### Atomic Commits
**Decision**: One logical change per commit
**Rationale**:
- Clear history
- Easy rollback
- Better code review

### Single Source of Truth
**Decision**: Centralize all type definitions and schemas
**Locations**:
- Schema: `/prisma/schema.prisma`
- Types: `/src/shared/types.ts`
- Enums: `/src/shared/enums.ts`

## Pending Decisions

### Scheduling Engine Consolidation
**Issue**: Three different scheduling implementations exist
**Options**:
1. Unify into single engine
2. Extract common interface
3. Document which to use when

### Logger Implementation Consolidation
**Issue**: Multiple logger implementations
**Options**:
1. Standardize on electron-log
2. Create unified logger service
3. Remove redundant implementations