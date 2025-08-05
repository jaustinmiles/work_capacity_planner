# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Work Capacity Planner - an Electron-based desktop application for managing software engineer workload using capacity-based scheduling. The project is currently in the planning phase with a comprehensive technical specification.

## Technology Stack

- **Framework**: Electron 26+ with React 18
- **Language**: TypeScript 5.0+
- **State Management**: Zustand
- **Database**: SQLite with Prisma ORM
- **UI Framework**: Arco Design (professional React component library) + Tailwind CSS
- **Date/Time**: dayjs (lightweight date manipulation library)
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library + Playwright

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
```

## Project Structure

```
work-capacity-planner/
├── src/
│   ├── main/           # Electron main process
│   ├── renderer/       # React app
│   ├── shared/         # Shared types and utilities
│   └── preload/        # Preload scripts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── resources/          # App icons, etc.
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .github/            # CI/CD workflows
├── electron-builder.yml
├── package.json
├── tsconfig.json
├── vite.config.ts
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
- **Task**: Contains duration, importance, urgency, type, async wait time, and dependencies
- **DailySchedule**: Configurable work hours and meetings per weekday
- **ScheduledTask**: Represents when tasks are scheduled with partial task support

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

**Current Features:**
- Full CRUD operations for tasks and workflows with database persistence
- Smart scheduling engine that distributes tasks across available time slots
- Complex workflow creation with individual steps and dependencies
- Real-time timeline visualization showing task distribution
- Eisenhower Matrix for task prioritization
- Workload capacity calculations respecting daily limits
- Progress tracking and completion statistics
- Persistent data storage - no more losing tasks on restart!

**Next steps:**
- Create work day configuration UI (currently pending)
- Implement async wait period optimization
- Add calendar integration for meetings and appointments
- Create advanced analytics and reporting features

## Key Algorithms

- **Task Scheduling**: Distributes tasks across days based on available capacity
- **Dependency Resolution**: Topological sort considering dependencies and priorities
- **Capacity Calculation**: Accounts for meetings when determining available work time

## UI/UX Design Patterns

- **Desktop-first layout** with sidebar navigation and main content area
- **Professional design system** using Arco Design components
- **Modal-based forms** for task creation and editing
- **Card-based content organization** for better visual hierarchy
- **Interactive elements** with hover effects, tooltips, and confirmation dialogs
- **Progress visualization** with completion rates and statistics
- **Responsive grid layouts** for matrix views and dashboards

## Testing Strategy

- Unit tests for business logic and algorithms
- Integration tests for IPC and database operations
- E2E tests for critical workflows using Playwright
- Performance tests for scheduling with large datasets