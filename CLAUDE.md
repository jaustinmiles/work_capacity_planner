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
- **Main Process**: Handles database operations, file system, system tray, auto-updater, and window management
- **Renderer Process**: Contains React UI, state management (Zustand), and business logic
- **IPC Communication**: Structured channels for main-renderer communication

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

**Phase 1 - UI/UX Complete:**
- ✅ Electron + React + TypeScript configured
- ✅ Vite build system with hot reload
- ✅ Arco Design + Tailwind CSS for professional UI
- ✅ Prisma with SQLite database
- ✅ Zustand state management with in-memory tasks
- ✅ Complete task management UI with CRUD operations
- ✅ Multiple view navigation (Task List, Eisenhower Matrix, Calendar)
- ✅ Professional desktop layout with sidebar navigation
- ✅ Enhanced forms, modals, and user interactions

**Current Features:**
- Task creation with importance/urgency scoring
- In-line task editing and deletion
- Priority-based task sorting and visualization
- Eisenhower Matrix for task prioritization
- Workload capacity calculations
- Progress tracking and completion statistics

**Next steps:**
- Implement database persistence (replace in-memory storage)
- Create scheduling algorithm for automatic task distribution
- Set up IPC communication between main/renderer processes
- Add calendar integration and actual scheduling

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