# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Work Capacity Planner - an Electron-based desktop application for managing software engineer workload using capacity-based scheduling. The project is currently in the planning phase with a comprehensive technical specification.

## Technology Stack

- **Framework**: Electron 26+ with React 18
- **Language**: TypeScript 5.0+
- **State Management**: Zustand
- **Database**: SQLite with Prisma ORM
- **UI Framework**: Tailwind CSS with shadcn/ui components
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

Basic project infrastructure is set up:
- ✅ Electron + React + TypeScript configured
- ✅ Vite build system with hot reload
- ✅ Tailwind CSS for styling
- ✅ Prisma with SQLite database
- ✅ Basic project structure created
- ✅ Development scripts configured

Next steps from technical specification:
- Implement Task CRUD operations
- Create scheduling algorithm
- Build UI components (TaskList, Calendar, etc.)
- Set up IPC communication between main/renderer
- Implement Zustand state management

## Key Algorithms

- **Task Scheduling**: Distributes tasks across days based on available capacity
- **Dependency Resolution**: Topological sort considering dependencies and priorities
- **Capacity Calculation**: Accounts for meetings when determining available work time

## Testing Strategy

- Unit tests for business logic and algorithms
- Integration tests for IPC and database operations
- E2E tests for critical workflows using Playwright
- Performance tests for scheduling with large datasets