# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Before Making Changes

**ALWAYS consult these resources BEFORE implementing anything:**

1. **Architecture Documentation**:
   - `/docs/architecture.md` - System design and component relationships
   - `/docs/project-spec.md` - Original requirements and design decisions
   - `prisma/schema.prisma` - Database schema (source of truth)

2. **Check Existing Patterns**:
   - Search for similar functionality before creating new code
   - Use `grep` or `glob` to find existing implementations
   - Follow established patterns for consistency

3. **Test Your Understanding**:
   - Read the relevant code before modifying
   - Run `npm run typecheck` to verify assumptions
   - Check if tests exist for the area you're modifying

## ⚠️ KNOWN ISSUES

### Task Type Inconsistencies
The database allows any string for task `type` field, but the scheduler only understands:
- `'focused'` - Deep work requiring concentration  
- `'admin'` - Administrative/shallow work

**Problem:** AI or user input may create tasks with invalid types like:
- `'errand'`, `'home'`, `'communication'` - These get cast to `'admin'` by scheduler
- Any other string value - Will cause scheduler errors

**TODO:** Either:
1. Add database enum constraint to only allow 'focused' | 'admin'
2. Add proper type mapping in the scheduler  
3. Expand the scheduler to handle more task types

## 🚨 CRITICAL: Unified Task Model & Workflow Protection

**NEVER modify the unified task model without extreme caution!**

### Data Model Overview
The app uses a unified Task model where workflows are Tasks with `hasSteps: true` and a `steps` array.

### Critical Data Flow for Scheduling
1. **Database Storage**: 
   - Simple tasks: `Task` with `hasSteps: false`
   - Workflows: `Task` with `hasSteps: true` + related `TaskStep` records

2. **Data Loading**:
   - `getTasks()` returns ALL tasks (including workflows as Task objects)
   - `getSequencedTasks()` returns ONLY workflows in SequencedTask format

3. **Scheduling Components MUST**:
   ```typescript
   // CORRECT: Filter workflows from tasks array
   const simpleTasksOnly = tasks.filter(t => !t.hasSteps)
   scheduleItems(simpleTasksOnly, sequencedTasks, ...)
   
   // WRONG: Passing all tasks causes duplicate workflows!
   scheduleItems(tasks, sequencedTasks, ...) // ❌ DON'T DO THIS
   ```

4. **Why This Matters**:
   - Workflows exist in BOTH arrays if not filtered
   - This causes duplicate rendering in Gantt chart
   - Each workflow appears twice: once as a task bar, once as individual steps

### UI Expectations
The UI still expects the old SequencedTask format with `steps` and `totalDuration` fields.

**Critical points:**
- `getSequencedTasks()` MUST return workflows formatted as SequencedTasks
- `getTasks()` MUST include the `steps` array for workflows
- The `formatTask()` method MUST check `task.TaskStep` (capital T) from Prisma
- Workflows MUST have `totalDuration`, `steps`, `criticalPathDuration`, etc.
- See `/src/main/__tests__/database-workflow-protection.test.ts` for critical tests

**If workflows stop showing up in the UI:**
1. Check that `getSequencedTasks()` returns proper format with steps
2. Verify `formatTask()` includes steps from `task.TaskStep`
3. Ensure the database query includes `{ TaskStep: true }`
4. Run the workflow protection tests immediately

## Project Overview

This is a Work Capacity Planner - an Electron-based desktop application for managing software engineer workload using capacity-based scheduling. The project is currently in the planning phase with a comprehensive technical specification.

## Technology Stack

- **Framework**: Electron 26+ with React 19
- **Language**: TypeScript 5.0+ with strict mode enabled
- **State Management**: Zustand with session-aware persistence
- **Database**: SQLite with Prisma ORM (session-isolated data)
- **UI Framework**: Arco Design (professional React component library) + Tailwind CSS
- **Date/Time**: dayjs (lightweight date manipulation library)
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library + Playwright
- **AI Services**: Claude Opus 4.1 + OpenAI Whisper API
- **Code Quality**: ESLint with enhanced TypeScript rules

### ⚡ Type Safety Requirements

**This project enforces strict TypeScript compliance:**
- `strict: true` in tsconfig.json
- `exactOptionalPropertyTypes: true` for precise null/undefined handling
- Zero tolerance for TypeScript errors before committing
- All database models have proper TypeScript interfaces
- Comprehensive type definitions in `/src/shared/types.ts`

## Development Commands

```bash
# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma migrate dev

# Development - starts both Vite dev server and Electron
npm run start

# Clean restart (kills processes, fixes permissions, rebuilds)
npm run restart

# Build
npm run build

# Test
npm test

# Prisma Studio (database viewer)
npm run prisma:studio

# Lint/typecheck
npm run lint
npm run typecheck

# Check everything before committing
npm run check  # Runs both typecheck and lint
```

## CRITICAL: Workflow Protection

**⚠️ NEVER break workflow functionality!**
- The getSequencedTasks() method MUST return SequencedTask format for UI compatibility
- Always include `steps` array when returning workflows
- Run workflow protection tests before ANY database changes:
  ```bash
  npm test -- database-workflow-protection.test.ts
  ```
- If you modify database.ts, ALWAYS verify workflows still appear in the UI

## IMPORTANT: Development Workflow

**ALWAYS follow this workflow when making changes:**

1. **Before Starting Development**
   ```bash
   # Ensure clean state
   npm run typecheck  # MUST pass with 0 errors
   npm run lint       # Should have minimal warnings
   
   # Check current error count if non-zero
   npm run typecheck 2>&1 | grep "error TS" | wc -l
   ```

2. **During Development**
   - Make incremental changes
   - Run `npm run typecheck` after significant changes
   - Test components in isolation when possible

3. **Before Declaring "Task Complete"**
   ```bash
   # MANDATORY checks - ALL must pass:
   npm run build:main     # Builds main process
   npm run build:preload  # Builds preload script
   npm run typecheck      # Must have 0 errors
   npm run lint           # Address any new errors
   npm test -- --run      # Run unit tests
   
   # If any of these fail, fix the issues before proceeding
   ```
   
   **🚨 NEVER tell the user a task is complete unless:**
   - TypeScript has 0 errors (`npm run typecheck`)
   - All tests pass (`npm test -- --run`)
   - The app builds successfully
   - You've manually tested the feature works
   
   **🚨 TEST FAILURE POLICY:**
   - NEVER move on from failing tests without understanding why they fail
   - The ONLY acceptable reason for test failures is if a feature is actively in development
   - If tests fail, you MUST either:
     1. Fix the failing tests
     2. Understand exactly why they're failing and document it
     3. Mark tests as `.skip` with a comment explaining why (only for in-development features)
   - Complex bugs often arise from ignoring "unrelated" test failures

4. **Common Issues to Watch For**
   - Import errors: Always check existing imports before adding new libraries
   - Arco Design usage: Use `@arco-design/web-react` components and icons
   - TypeScript strict mode: Handle all nullable types properly
   - React 19 compatibility: Some libraries may have warnings
   - Unused imports: Remove immediately (TS6133)
   - Possibly undefined: Use optional chaining (?.) or null checks (TS18048)
   - Type mismatches: Check Prisma types match our interfaces (TS2322)
   - exactOptionalPropertyTypes: Use null instead of undefined for Prisma (TS2375)

5. **Testing New Features**
   - Start the dev server: `npm run start`
   - Check browser console for runtime errors
   - Test the feature end-to-end
   - Verify no regression in existing features

## Project Structure

```
task-planner/
├── src/
│   ├── main/              # Electron main process (database, IPC, AI services)
│   ├── renderer/          # React app
│   │   ├── components/
│   │   │   ├── ai/        # AI-powered brainstorming
│   │   │   ├── session/   # Work context management
│   │   │   └── tasks/     # Task and workflow components
│   │   ├── store/         # Zustand state management
│   │   └── utils/         # Scheduling algorithms
│   ├── shared/            # Shared types and utilities
│   └── test/              # Test setup and utilities
├── prisma/
│   ├── schema.prisma      # Database schema with sessions
│   └── migrations/
├── docs/                  # Technical documentation
├── vitest.config.ts       # Test configuration
├── eslint.config.js       # Linting rules
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture Overview

### Process Architecture
- **Main Process**: Handles database operations (via Prisma), IPC handlers, file system, and window management
- **Renderer Process**: Contains React UI, state management (Zustand), and business logic
- **IPC Communication**: Secure communication via preload script (contextBridge) for database operations

### Key Components
- **TaskManagement**: CRUD operations for tasks with importance/urgency scoring
- **Scheduling**: Capacity-based algorithm that respects daily limits (4h focused, 3h admin)
- **Analytics**: Eisenhower matrix, time tracking, burndown charts
- **Database**: Local SQLite with Prisma ORM for persistence

### Core Data Models
- **Session**: Work contexts for data isolation (multiple projects/clients)
- **Task**: Contains duration, importance, urgency, type, async wait time, dependencies, and hard deadlines
- **SequencedTask**: Multi-step workflows with execution tracking
- **WorkPattern**: Daily work schedules with time blocks and capacity
- **JobContext**: Persistent context about user's role and work patterns

## Implementation Status

**Phase 1 - Core Foundation Complete:**
- ✅ Electron + React + TypeScript configured
- ✅ Vite build system with hot reload
- ✅ Arco Design + Tailwind CSS for professional UI
- ✅ Prisma with SQLite database
- ✅ Zustand state management with database persistence
- ✅ Complete task management UI with CRUD operations
- ✅ Multiple view navigation (Task List, Eisenhower Matrix, Calendar)
- ✅ Professional desktop layout with sidebar navigation
- ✅ Enhanced forms, modals, and user interactions
- ✅ Secure IPC communication via preload script
- ✅ Database persistence for both tasks and sequenced workflows

**Phase 2 - Advanced Scheduling Complete:**
- ✅ Smart scheduling algorithm with capacity-based distribution
- ✅ Complex workflow management with step-by-step tasks
- ✅ Dependency resolution and critical path calculation
- ✅ Timeline visualization with Gantt-style charts
- ✅ Task priority optimization (importance × urgency scoring)

**Phase 3 - AI Integration Complete:**
- ✅ Voice recording with Whisper transcription
- ✅ Claude Opus 4.1 for task/workflow extraction
- ✅ Job context and jargon dictionary persistence
- ✅ AI-powered task enhancement and clarification
- ✅ Natural language to structured task conversion

**Phase 4 - Recent Enhancements:**
- ✅ Session management for multiple work contexts
- ✅ Hard deadline support with priority boosting
- ✅ Workflow execution controls (start/pause/reset)
- ✅ Eisenhower matrix zoom and workflow integration
- ✅ React 19 compatibility fixes
- ✅ Testing infrastructure with Vitest
- ✅ Enhanced TypeScript linting rules

**Current Status (as of 2025-08-13 - Beta Test Fixes):**
- ✅ TypeScript: 0 errors 
- ✅ Tests: 101 passing, 3 skipped, 0 failing
- ✅ All beta testing issues resolved:
  - Fixed 0 duration bug (workflows now use `totalDuration` from AI)
  - Fixed WebM audio upload with proper OpenAI API handling
  - Added input fields for jargon dictionary definitions
  - Fixed graph visualization breaking when editing
  - Implemented AI sleep block auto-extraction
  - Created custom ClockTimePicker component for intuitive time selection
- ✅ Build status: Successful
- ✅ New components added:
  - `/src/renderer/components/common/ClockTimePicker.tsx` - Visual clock interface
  - `/src/renderer/components/common/TimeInput.tsx` - Text-based time input (alternative)

## Key Algorithms

- **Task Scheduling**: Priority-based scheduling with deadline awareness
- **Dependency Resolution**: Topological sort considering dependencies and priorities
- **Capacity Calculation**: Work blocks with type-specific capacity tracking
- **Deadline Prioritization**: Tasks within 24 hours get priority boost
- **Workflow Interleaving**: Smart distribution to prevent monopolization
- **Async Gap Scheduling**: Efficient packing during wait times
- **Cross-Midnight Handling**: Support for sleep blocks spanning days

## UI/UX Design Patterns

- **Desktop-first layout** with sidebar navigation and main content area
- **Professional design system** using Arco Design components
- **Modal-based forms** for task creation and editing
- **Card-based content organization** for better visual hierarchy
- **Interactive elements** with hover effects, tooltips, and confirmation dialogs

## Code Patterns and Best Practices

### UI Components
- **ALWAYS use Arco Design components** - Never assume other UI libraries
- Import pattern: `import { Button, Card, Space } from '@arco-design/web-react'`
- Icons: `import { IconName } from '@arco-design/web-react/icon'`
- Typography: Use `Typography.Title` and `Typography.Text` components
- Grid: Use `const { Row, Col } = Grid` destructuring

### State Management
- Use Zustand store hooks: `useTaskStore`, `useSessionStore`
- Always handle async operations with try/catch
- Update local state optimistically, then sync with database

### Database Operations

**CRITICAL: Database File Location - $100 LESSON LEARNED**
- **ALWAYS use the database in the `prisma/` directory**: `prisma/dev.db`
- **NEVER create or use a root directory database**: `dev.db` 
- The root `dev.db` has been DELETED to prevent confusion
- When debugging database issues, ALWAYS check: `sqlite3 prisma/dev.db "SELECT ..."`
- The Prisma client is configured to use `DATABASE_URL="file:./dev.db"` which resolves to `prisma/dev.db` from Prisma's perspective

**Verified Complete Database Contents (as of 2025-08-13):**
- 21 tasks (not 4!)
- 5 workflows
- 6 work patterns (schedule)
- 2 job contexts
- If you see only 4 tasks, YOU ARE USING THE WRONG DATABASE!

**Backup System:**
- Verified backups are in `backups/verified/`
- Run `./backup-database.sh` to create timestamped backups
- The complete data backup is: `backups/verified/complete-data-21-tasks-5-workflows.db`

**IMPORTANT: Database Service Architecture**

1. **Service Structure**:
   ```typescript
   // Main process: src/main/database.ts
   export class DatabaseService {
     private static instance: DatabaseService
     private client: PrismaClient
     
     static getInstance(): DatabaseService { ... }
   }
   export const db = DatabaseService.getInstance()
   ```

2. **Common Database Patterns**:
   ```typescript
   // Always get active session first
   const sessionId = await this.getActiveSession()
   
   // Include relations when needed
   const result = await this.client.model.findMany({
     where: { sessionId },
     include: { relatedModel: true }
   })
   
   // Handle JSON fields
   return result.map(item => ({
     ...item,
     jsonField: item.jsonField ? JSON.parse(item.jsonField) : null
   }))
   ```

3. **Current Data Models** (as of last update):
   - **Task**: Standalone tasks with duration, importance, urgency
   - **SequencedTask**: Workflows with multiple TaskStep children
   - **TaskStep**: Individual steps in a workflow
   - **WorkSession**: Time tracking for regular work blocks
   - **StepWorkSession**: Time tracking for workflow steps
   - **WorkPattern**: Daily work schedule with blocks and meetings

4. **Common Pitfalls**:
   - Forgetting to filter by sessionId
   - Not including related models in queries
   - Assuming Task and SequencedTask are the same (they're not!)
   - Not parsing JSON fields before returning

### Database Migrations

**ALWAYS BACKUP BEFORE MIGRATIONS:**

```bash
# Before any schema change:
1. npm run db:backup    # Creates timestamped backup
2. Make schema changes in prisma/schema.prisma
3. npm run prisma:migrate dev --name descriptive_name
4. Test thoroughly
5. If issues arise: npm run db:restore
```

### TypeScript Patterns
```typescript
// Handle nullable types
const value = nullableValue ?? defaultValue

// Type guards for unions
if ('steps' in task) {
  // task is SequencedTask
}

// Proper async error handling
try {
  await someAsyncOperation()
} catch (error) {
  console.error('Descriptive error message:', error)
}
```

### Common Pitfalls to Avoid
1. **Don't assume libraries** - Always check what's already in use
2. **Don't skip type checking** - Run `npm run typecheck` frequently
3. **Don't ignore nullable types** - TypeScript strict mode requires proper handling
4. **Don't mix UI libraries** - Stick to Arco Design components
5. **Don't forget IPC patterns** - Use preload script for all database calls
6. **Don't disable TypeScript strict checks** - Fix the root cause, not the symptom
7. **Don't create TaskStep without required fields** - Always include `taskId` and `percentComplete`
8. **Don't mix property names** - Use `focusMinutes/adminMinutes` not `focused/admin`
9. **Don't use hardcoded strings** - Use enums or constants for repeated string values
10. **IPC Serialization** - Enums become strings when passed through IPC. Handle both enum values AND string literals in switch statements

## Testing Strategy

**IMPORTANT: Always run tests after writing them!**

When you write or modify tests:
1. Run the specific test file: `npm test -- path/to/test.ts --run`
2. Fix any failures before proceeding
3. Run related tests to check for regressions
4. Only mark tasks as complete after tests pass

## Testing Strategy

- Unit tests for business logic and algorithms (Vitest)
- Component tests with React Testing Library
- Integration tests for IPC and database operations
- E2E tests for critical workflows using Playwright
- Performance tests for scheduling with large datasets

### Testing Commands
```bash
# Run all tests once
npm test -- --run

# Run tests in watch mode
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Test Structure
- Tests are co-located with source files in `__tests__` directories
- Test setup is in `src/test/setup.ts`
- Mock window.matchMedia and electron API for component tests
- Use vi.useFakeTimers() for time-dependent tests

## Core Design Philosophy

### Time and Scheduling Principles
**CRITICAL: The scheduler ONLY moves forward in time**
- Tasks are scheduled from the current moment onwards - never in the past
- No backfilling of earlier time slots - once time has passed, those slots are gone
- Time tracking (logging work done) can be recorded for past times (because users may work without logging in real-time)
- But scheduling (planning future work) only looks forward
- This reflects reality: you can't go back in time to do work, you can only plan forward

This is a fundamental design principle that affects:
- The scheduling algorithm (currentTime only advances, never retreats)
- The UI (no ability to drag tasks to past time slots)
- The calendar view (past blocks are shown as unavailable/grayed out)
- Test design (tests must account for forward-only scheduling)

### Common Patterns & Best Practices

### React 19 Compatibility
- Use custom Message wrapper instead of Arco's direct Message API
- Avoid non-standard DOM props (e.g., valueStyle)

### Session Management
- All database queries filter by active sessionId
- Session context persists across app restarts
- Use SessionManager component for switching contexts

### Error Handling
- Always show user-friendly error messages
- Log detailed errors to console for debugging
- Use try-catch in all async operations

### TypeScript Patterns
- Strict mode enabled - no implicit any
- Use type guards for runtime validation
- Prefer interfaces over type aliases for objects

### Code Organization
- Components in feature-based folders
- Shared types in /shared directory
- Database operations only in main process
- State management through Zustand store

## 🎯 PREFERRED DEBUGGING APPROACH: Human-AI Co-Problem Solving

### The Database Backup Integration Test Method

When debugging complex scheduling or data flow issues, use this highly effective approach:

1. **Human creates test scenario in UI**:
   - Set up tasks, workflows, and schedules through the actual app
   - Verify what you're seeing visually
   - Document the expected vs actual behavior

2. **AI queries and backs up the database**:
   ```bash
   # Query exact data
   sqlite3 prisma/dev.db "SELECT * FROM Task WHERE sessionId = (SELECT id FROM Session WHERE isActive = 1);"
   
   # Create timestamped backup
   cp prisma/dev.db "prisma/backup-$(date +%Y%m%d-%H%M%S)-issue-description.db"
   ```

3. **Create integration test with real data**:
   - Copy backup to test location
   - Load actual data from database
   - Run the EXACT same logic as the UI component
   - Compare results

4. **Benefits of this approach**:
   - ✅ **Perfect reproduction** - Uses actual user data, not mocked
   - ✅ **Efficient tokens** - No need to describe complex scenarios
   - ✅ **Fast debugging** - Can immediately see discrepancies
   - ✅ **Permanent test** - Becomes regression test for that exact scenario
   - ✅ **Clear communication** - Human and AI see the same data

### Example Success Story
In August 2025, we debugged a complex duplicate workflow rendering issue:
- Human: "I see workflows appearing twice in Gantt chart"
- AI: Created integration test with backed-up database
- Test showed correct output, but UI had duplicates
- Discovery: GanttChart was passing workflows in both `tasks` AND `sequencedTasks` arrays
- Fix: Filter workflows from tasks array
- Result: Perfect alignment between test and UI

### When to Use This Method
- Complex scheduling or timing issues
- Data flow problems between components
- Discrepancies between what's stored vs displayed
- Any issue where "it works in test but not in UI" (or vice versa)

## When You Get Stuck

1. **Can't find a file?**
   - Check `/docs/architecture.md` for file structure
   - Use `glob` tool with patterns like `**/*ComponentName*`
   - Look at imports in similar components

2. **Database query not working?**
   - Check `prisma/schema.prisma` for exact field names
   - Verify relationships and includes
   - Look for similar queries in `src/main/database.ts`

3. **TypeScript errors?**
   - Check if types are imported from `@shared/types`
   - Verify nullable fields are handled
   - Run `npm run typecheck` for detailed errors

4. **Complex debugging?**
   - **USE THE DATABASE BACKUP METHOD ABOVE!** 🎯

## Future Feature Ideas

**Visual Scheduling Algorithm Builder**
- Node-based interface for creating custom prioritization algorithms
- Drag-and-drop logic blocks: topological sort, filters, boosters, splitters
- Visual flow diagram showing task flow through scheduling pipeline
- Support for conditional branching, loops, and merge points
- Export/import custom algorithms as JSON for sharing
- Pre-built templates for common scheduling patterns
- Real-time preview of task scheduling with custom algorithm
- Use cases: prioritize by tag, boost async tasks, split by duration, custom scoring