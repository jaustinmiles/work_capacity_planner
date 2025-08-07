# Task Planner Architecture

## Overview

The Task Planner is an Electron-based productivity application that combines AI-powered task extraction with intelligent scheduling. It uses a secure multi-process architecture with React on the frontend and SQLite for persistence.

## Directory Structure

```
task_planner/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Entry point, window management
│   │   ├── preload.ts     # Secure context bridge
│   │   └── database.ts    # Prisma database operations
│   ├── renderer/          # React frontend
│   │   ├── App.tsx        # Main application component
│   │   ├── components/    # UI components
│   │   │   ├── ai/        # AI integration components
│   │   │   ├── calendar/  # Calendar views
│   │   │   ├── common/    # Shared components (Message wrapper)
│   │   │   ├── session/   # Session management
│   │   │   ├── settings/  # Settings modals
│   │   │   ├── tasks/     # Task management
│   │   │   └── timeline/  # Gantt chart
│   │   ├── services/      # Frontend services
│   │   ├── store/         # Zustand state management
│   │   └── utils/         # Utility functions
│   └── shared/            # Shared types and services
│       ├── types.ts       # Core task types
│       ├── sequencing-types.ts  # Workflow types
│       ├── work-settings-types.ts # Schedule config
│       └── ai-service.ts  # AI integration logic
├── prisma/
│   └── schema.prisma      # Database schema
├── test/                  # Test configuration
│   └── setup.ts          # Test environment setup
└── dist/                  # Build output

```

## Core Components

### 1. Main Process (`src/main/`)

**Responsibilities:**
- Window lifecycle management
- Secure IPC channel setup
- Database operations via Prisma
- API key management
- File system access

**Key Files:**
- `main.ts`: Electron app initialization, BrowserWindow creation
- `preload.ts`: Exposes safe APIs to renderer via contextBridge
- `database.ts`: All database CRUD operations

### 2. Renderer Process (`src/renderer/`)

**Responsibilities:**
- User interface rendering
- State management
- User interaction handling
- Display logic

**Key Components:**

#### AI Integration (`components/ai/`)
- `BrainstormModal.tsx`: Voice recording and AI task extraction
- `TaskCreationFlow.tsx`: Structured task creation wizard

#### Task Management (`components/tasks/`)
- `TaskList.tsx`: Main task list with inline editing
- `TaskEdit.tsx`: Task property editing with deadline support
- `SequencedTaskView.tsx`: Workflow management with execution controls
- `SequencedTaskEdit.tsx`: Workflow editing with graph viz (needs refactoring)
- `EisenhowerMatrix.tsx`: Priority matrix with workflow support and zoom

#### Scheduling (`components/timeline/`)
- `GanttChart.tsx`: Priority-based Gantt chart with zoom
- `scheduler.ts`: Scheduling algorithm implementation

#### Settings (`components/settings/`)
- `WorkSettingsModal.tsx`: Work hours and capacity configuration
- `WorkScheduleModal.tsx`: Daily work block scheduling

#### Session Management (`components/session/`)
- `SessionManager.tsx`: Multiple work context management

### 3. Shared Code (`src/shared/`)

**Purpose:** Type definitions and business logic shared between processes

**Key Files:**
- `types.ts`: Core Task interface and enums
- `sequencing-types.ts`: SequencedTask and TaskStep types
- `work-settings-types.ts`: WorkSettings, WorkHours, BlockedTime
- `ai-service.ts`: Claude API integration and prompt engineering

## Data Flow

### Task Creation Flow
```
1. User records audio in BrainstormModal
2. Audio sent to OpenAI Whisper API (via main process)
3. Transcript sent to Claude Opus 4.1
4. AI extracts tasks/workflows
5. User reviews and confirms
6. Tasks saved to SQLite database
7. UI updates via Zustand store
```

### Scheduling Flow
```
1. Tasks and workflows loaded from database
2. Work settings applied (hours, capacity, blocks)
3. Scheduler sorts by priority (urgency × importance)
4. Items packed into available time slots
5. Async wait times create gaps for other work
6. Gantt chart renders scheduled items
```

## State Management

### Zustand Store (`useTaskStore`)

**State:**
- `tasks`: Array of Task objects
- `sequencedTasks`: Array of SequencedTask objects
- `workSettings`: User's work hour preferences
- `selectedTaskId`: Currently selected task

**Actions:**
- CRUD operations for tasks and workflows
- Work settings updates
- Scheduling generation

### Database Schema

**Tables:**
- `Session`: Work contexts for data isolation
- `Task`: Single tasks with priority, duration, type, deadline
- `SequencedTask`: Multi-step workflows with execution status
- `TaskStep`: Individual steps in workflows
- `JobContext`: Persistent work context
- `ContextEntry`: Key-value context pairs
- `JargonEntry`: Industry-specific terminology
- `WorkPattern`: Daily work schedules with blocks
- `WorkBlock`: Time blocks with capacity tracking
- `Meeting`: Scheduled meetings that block time

## Security Architecture

### Process Isolation
- Main process handles all sensitive operations
- Renderer has no direct file system or network access
- API keys only accessible in main process

### IPC Security
- All IPC channels explicitly defined in preload
- Type-safe communication via TypeScript
- No arbitrary code execution

### Data Validation
- Prisma validates all database operations
- Input sanitization in forms
- API response validation

## AI Integration

### Claude Opus 4.1
- Advanced workflow extraction
- Natural language understanding
- Context-aware processing
- Never makes assumptions

### Prompt Engineering
- System prompts emphasize structured output
- JSON response format for parsing
- Context injection from job context
- Jargon dictionary expansion

## Performance Optimizations

### Frontend
- React memo for expensive components
- Virtualized lists for large datasets
- Debounced search and filtering
- Lazy loading of modal content

### Scheduling
- Efficient priority queue implementation
- Early termination for infeasible schedules
- Caching of work hour calculations
- Incremental updates on changes

## Future Architecture Considerations

### Work Blocks System
To support flexible work blocks throughout the day:
1. Replace single start/end time with array of work blocks
2. Each block has start time, end time, and capacity
3. Blocks can be customized per day
4. Real-time tracking of used capacity
5. Dynamic ETA updates based on block selection

### Time Tracking
To track accumulated work time:
1. Add `WorkSession` table for time entries
2. Track actual vs estimated durations
3. Update remaining capacity in real-time
4. Provide daily/weekly analytics

### Enhanced Scheduling
For more intelligent async-aware scheduling:
1. Model different async wait patterns
2. Learn from historical completion times
3. Optimize for throughput vs latency
4. Consider task switching overhead

## Development Guidelines

### Adding New Features
1. Define types in shared directory
2. Add database schema if needed
3. Create IPC channel in preload
4. Implement database operations in main
5. Build UI components in renderer
6. Update store actions
7. Add tests for critical paths

### Code Style
- TypeScript strict mode
- ESLint configuration
- Consistent naming conventions
- Comprehensive error handling
- User-friendly error messages

### Testing Strategy
- Unit tests for scheduling algorithm (Vitest)
- Component tests with React Testing Library
- Integration tests for IPC channels
- E2E tests for critical workflows
- Manual testing of voice features

### Recent Improvements
- React 19 compatibility (Message component wrapper)
- Session management for multiple work contexts
- Deadline prioritization in scheduling
- Workflow execution controls (start/pause/reset)
- Enhanced TypeScript strictness in ESLint
- Testing infrastructure with Vitest