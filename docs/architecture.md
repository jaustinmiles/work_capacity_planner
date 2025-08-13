# Work Capacity Planner - Architecture Documentation

**Last Updated:** August 13, 2025  
**Version:** 1.0.0-beta

## Overview

Work Capacity Planner is an Electron-based desktop application for managing software engineer workload using capacity-based scheduling with a focus on asynchronous workflows. The application helps engineers plan their work around async wait times (code reviews, CI/CD pipelines, approvals) and optimize their productivity.

## Core Architecture

### Technology Stack

- **Desktop Framework:** Electron 26+
- **Frontend:** React 19 with TypeScript 5.0+
- **UI Components:** Arco Design + Tailwind CSS
- **State Management:** Zustand with persistence
- **Database:** SQLite with Prisma ORM
- **Build System:** Vite
- **Testing:** Vitest + React Testing Library
- **AI Services:** Claude Opus 4.1 + OpenAI Whisper

### Process Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│  - Database operations (Prisma)                          │
│  - IPC handlers                                          │
│  - Window management                                     │
│  - AI service integration                                │
└───────────────┬─────────────────────────────────────────┘
                │
                │ IPC via Preload Script
                │
┌───────────────▼─────────────────────────────────────────┐
│                  Electron Renderer Process               │
│  - React application                                     │
│  - Zustand store                                         │
│  - UI components (Arco Design)                           │
│  - Scheduling algorithms                                 │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Input** → React Components → Zustand Store → IPC Call → Main Process
2. **Main Process** → Database Operation → IPC Response → Zustand Store → React Re-render
3. **AI Features** → Voice Recording → Whisper API → Claude API → Structured Data → Database

## Database Design

### Unified Task Model (CRITICAL)

**⚠️ IMPORTANT:** The application uses a unified Task model where workflows are Tasks with `hasSteps: true`. The UI still expects SequencedTask format for backwards compatibility.

```prisma
model Task {
  id                    String    @id
  name                  String
  duration              Int       // Total duration in minutes
  hasSteps              Boolean   @default(false)
  
  // Workflow-specific fields
  criticalPathDuration  Int?      // Critical path through dependencies
  worstCaseDuration     Int?      // Worst case with all branches
  currentStepId         String?   // Currently active step
  overallStatus         String    @default("not_started")
  
  // Task fields
  importance            Int
  urgency               Int
  type                  String    // "focused" | "admin"
  asyncWaitTime         Int       @default(0)
  dependencies          String    // JSON array of task IDs
  
  // Completion tracking
  completed             Boolean   @default(false)
  completedAt           DateTime?
  actualDuration        Int?
  
  // Relations
  TaskStep              TaskStep[] @relation("TaskSteps")
  sessionId             String
  Session               Session    @relation(fields: [sessionId])
}

model TaskStep {
  id               String    @id
  taskId           String
  name             String
  duration         Int
  type             String
  dependsOn        String    // JSON array of step IDs
  asyncWaitTime    Int       @default(0)
  status           String    @default("pending")
  stepIndex        Int
  percentComplete  Int       @default(0)
  
  Task             Task      @relation("TaskSteps", fields: [taskId])
}
```

### Key Database Services

- `DatabaseService` (singleton) - Main database interface
- `getSequencedTasks()` - Returns workflows formatted as SequencedTasks for UI
- `getTasks()` - Returns all tasks including workflows with steps
- `formatTask()` - Ensures proper formatting with steps array

## Component Architecture

### Main Components

```
src/renderer/
├── components/
│   ├── tasks/
│   │   ├── TaskList.tsx          // Main task list view
│   │   ├── TaskItem.tsx          // Individual task display
│   │   ├── TaskForm.tsx          // Task creation/editing
│   │   ├── SequencedTaskView.tsx // Workflow display
│   │   └── EisenhowerMatrix.tsx  // Priority matrix view
│   ├── timeline/
│   │   └── GanttChart.tsx        // Timeline visualization
│   ├── calendar/
│   │   └── WeeklyCalendar.tsx    // Weekly schedule view
│   ├── progress/
│   │   ├── WorkflowProgressTracker.tsx // Step-by-step progress
│   │   └── TimeLoggingModal.tsx  // Manual time entry
│   └── ai/
│       ├── BrainstormModal.tsx   // AI task extraction
│       └── TaskCreationFlow.tsx  // AI-assisted creation
├── store/
│   └── useTaskStore.ts           // Zustand state management
├── utils/
│   └── flexible-scheduler.ts     // Core scheduling algorithm
└── services/
    └── database.ts               // IPC wrapper for database
```

### State Management

Zustand store manages:
- Tasks and workflows
- Active sessions
- Scheduling results
- Work settings
- Progress tracking

## Core Algorithms

### Flexible Scheduler

The scheduling algorithm handles:
1. **Priority-based scheduling** - Importance × Urgency scoring
2. **Async wait time management** - Blocks dependent steps during waits
3. **Capacity constraints** - Respects daily focus/admin limits
4. **Dependency resolution** - Ensures proper step ordering
5. **Deadline awareness** - Prioritizes tasks approaching deadlines
6. **Workflow interleaving** - Prevents single workflow monopolization

### Critical Path Calculation

For workflows:
- Analyzes dependency chains
- Calculates minimum completion time
- Considers async wait periods
- Identifies bottlenecks

## AI Integration

### Voice Workflow Creation

```
User Speech → Whisper API → Transcript → Claude Opus → Structured Workflow → Database
```

### Brainstorming Pipeline

```
Free-form Text → Claude Analysis → Task/Workflow Extraction → User Review → Database
```

## Testing Strategy

### Test Coverage

- **Unit Tests:** Business logic, algorithms, utilities
- **Component Tests:** React components with React Testing Library
- **Integration Tests:** IPC communication, database operations
- **E2E Tests:** Critical user workflows (planned)

### Critical Test Suites

- `database-workflow-protection.test.ts` - Protects workflow functionality
- `flexible-scheduler.test.ts` - Validates scheduling logic
- `database-unified.test.ts` - Tests unified task model

## Security Considerations

1. **IPC Security:** All database operations go through preload script
2. **Input Validation:** Zod schemas for AI responses
3. **API Keys:** Stored in environment variables
4. **Local Data:** SQLite database is local-only

## Performance Optimizations

1. **Database Queries:** Includes relations to minimize round trips
2. **Memoization:** React.memo for expensive components
3. **Virtual Scrolling:** For large task lists (planned)
4. **Debouncing:** Search and filter operations
5. **Background Processing:** AI operations don't block UI

## Technical Health

### Current Status (2025-08-13)
- **TypeScript:** ✅ 0 errors (strict mode fully enforced)
- **Tests:** ✅ 78 passing, 0 failing (runtime: 2s)
- **Build:** ✅ Successful production builds
- **Database:** ✅ Unified task model migration complete

### Remaining Technical Debt

1. **Test Coverage:** ~60% coverage, needs improvement for UI components
2. **Error Handling:** Some async operations lack proper error boundaries
3. **Performance:** Large workflow scheduling needs optimization (500+ tasks)
4. **Documentation:** Some modules lack inline documentation
5. **Code Cleanup:** Some `any` types remain in older code

## Future Architecture Considerations

1. **Plugin System:** For custom scheduling algorithms
2. **Multi-window Support:** Separate windows for different views
3. **Cloud Sync:** Optional cloud backup and sync
4. **Team Features:** Shared workflows and dependencies
5. **Mobile Companion:** View-only mobile app

## Development Guidelines

### Code Style

- TypeScript strict mode enabled
- ESLint with enhanced rules
- Prettier for formatting
- No unused imports/variables
- Comprehensive type definitions

### Git Workflow

- Main branch for stable code
- Feature branches for development
- Squash merge for clean history
- Comprehensive commit messages

### Testing Requirements

Before marking any task complete:
1. Run `npm run typecheck` - Must have 0 errors
2. Run `npm test -- --run` - All tests must pass
3. Run `npm run build` - Must build successfully
4. Manual testing of the feature

## Deployment

### Build Process

```bash
npm run build        # Build for current platform
npm run build:mac    # macOS build
npm run build:win    # Windows build
npm run build:linux  # Linux build
```

### Distribution

- macOS: DMG with code signing (planned)
- Windows: NSIS installer (planned)
- Linux: AppImage and DEB packages (planned)

## Monitoring and Analytics

Currently no telemetry. Future considerations:
- Error reporting (opt-in)
- Usage analytics (opt-in)
- Performance metrics
- Crash reporting

## Support and Maintenance

- GitHub Issues for bug reports
- Documentation in `/docs` directory
- CLAUDE.md for AI assistant guidance
- Regular dependency updates
- Security patch schedule