# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Work Capacity Planner - an Electron-based desktop application for managing software engineer workload using capacity-based scheduling. The project is currently in the planning phase with a comprehensive technical specification.

## Technology Stack

- **Framework**: Electron 26+ with React 19
- **Language**: TypeScript 5.0+ with strict mode
- **State Management**: Zustand with session-aware persistence
- **Database**: SQLite with Prisma ORM (session-isolated data)
- **UI Framework**: Arco Design (professional React component library) + Tailwind CSS
- **Date/Time**: dayjs (lightweight date manipulation library)
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library + Playwright
- **AI Services**: Claude Opus 4.1 + OpenAI Whisper API
- **Code Quality**: ESLint with enhanced TypeScript rules

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

## IMPORTANT: Development Workflow

**ALWAYS follow this workflow when making changes:**

1. **Before Starting Development**
   ```bash
   # Ensure clean state
   npm run typecheck  # Should pass with 0 errors
   npm run lint       # Should have minimal warnings
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

4. **Common Issues to Watch For**
   - Import errors: Always check existing imports before adding new libraries
   - Arco Design usage: Use `@arco-design/web-react` components and icons
   - TypeScript strict mode: Handle all nullable types properly
   - React 19 compatibility: Some libraries may have warnings

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

**Known Issues to Fix:**
- ⚠️ Workflow dependency naming inconsistencies in edit mode
- ⚠️ Graph view placement (should not be in edit modal)
- ⚠️ Missing edit controls in graph visualization

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
- All database methods return Promises
- Use typed parameters and return types
- Handle nullable fields properly in TypeScript
- Check if methods exist before calling them

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
- **Progress visualization** with completion rates and statistics
- **Responsive grid layouts** for matrix views and dashboards

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

## Common Patterns & Best Practices

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