# Work Capacity Planner - Technical Design Document

## Executive Summary

The Work Capacity Planner is an Electron-based desktop application that helps software engineers manage their workload using capacity-based scheduling. It respects daily work limits (4 hours focused work, 3 hours meetings/admin), handles async workflows, and provides realistic delivery estimates based on actual availability.

## Core Features

1. **Capacity-Based Scheduling**: Automatically distributes tasks across days based on available hours
2. **Task Management**: Create, edit, prioritize tasks with importance/urgency scoring
3. **Async Workflow Support**: Handle tasks with long-running async processes
4. **Dependency Management**: Ensure tasks are scheduled after their dependencies
5. **Meeting Integration**: Configure daily schedules with meetings that affect available work time
6. **Visual Planning Tools**: Eisenhower matrix, weekly calendar view, burndown tracking
7. **Data Persistence**: Save all data locally with automatic backups
8. **Time Tracking** (Future): Track actual vs estimated time for improved accuracy

## Technical Architecture

### Technology Stack
- **Framework**: Electron 26+ with React 18
- **Language**: TypeScript 5.0+
- **State Management**: Zustand (lightweight, TypeScript-friendly)
- **Database**: SQLite with Prisma ORM (for local persistence)
- **UI Framework**: Arco Design (professional React component library) with Tailwind CSS
- **Build Tool**: Vite (faster than webpack for development)
- **Testing**: Vitest + React Testing Library + Playwright (E2E)

### Process Architecture
```
Main Process (Node.js)
├── Database Operations (SQLite)
├── File System Operations
├── System Tray Integration
├── Auto-updater
└── Window Management

Renderer Process (React)
├── UI Components
├── State Management (Zustand)
├── IPC Communication
└── Business Logic
```

## Data Models

### Task
```typescript
interface Task {
  id: string; // UUID
  name: string;
  duration: number; // minutes
  importance: number; // 1-10
  urgency: number; // 1-10
  type: 'focused' | 'admin';
  asyncWaitTime: number; // minutes
  dependencies: string[]; // task IDs
  completed: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  actualDuration?: number; // for time tracking
  notes?: string;
  projectId?: string; // for grouping
}
```

### DailySchedule
```typescript
interface DailySchedule {
  id: string;
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  startTime: string; // "09:00"
  endTime: string; // "18:00"
  meetings: Meeting[];
}

interface Meeting {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  recurring: boolean;
}
```

### ScheduledTask
```typescript
interface ScheduledTask {
  taskId: string;
  scheduledDate: Date;
  scheduledMinutes: number;
  isPartial: boolean;
  isStart: boolean;
  isEnd: boolean;
}
```

## Component Architecture

### Main Window Components

```
App.tsx
├── Layout/
│   ├── Header.tsx (app title, stats summary)
│   ├── Sidebar.tsx (navigation, quick actions)
│   └── MainContent.tsx
├── Features/
│   ├── Dashboard/
│   │   ├── WorkloadSummary.tsx
│   │   ├── BurndownChart.tsx
│   │   └── QuickStats.tsx
│   ├── TaskManagement/
│   │   ├── TaskList.tsx
│   │   ├── TaskEditor.tsx
│   │   ├── TaskForm.tsx
│   │   └── TaskFilters.tsx
│   ├── Scheduling/
│   │   ├── WeeklyCalendar.tsx
│   │   ├── DaySchedule.tsx
│   │   ├── ScheduleConfiguration.tsx
│   │   └── MeetingManager.tsx
│   ├── Analytics/
│   │   ├── EisenhowerMatrix.tsx
│   │   ├── TimeTracking.tsx
│   │   └── EstimationAccuracy.tsx
│   └── Settings/
│       ├── GeneralSettings.tsx
│       ├── ScheduleDefaults.tsx
│       └── DataManagement.tsx
└── Shared/
    ├── Button.tsx
    ├── Input.tsx
    ├── Modal.tsx
    └── Toast.tsx
```

### Main Process Services

```
src/main/
├── index.ts (entry point)
├── database/
│   ├── prisma.ts
│   ├── migrations/
│   └── seed.ts
├── services/
│   ├── TaskService.ts
│   ├── ScheduleService.ts
│   ├── BackupService.ts
│   └── AnalyticsService.ts
├── ipc/
│   ├── handlers.ts
│   └── channels.ts
└── utils/
    ├── logger.ts
    └── updater.ts
```

## State Management Design

### Zustand Store Structure
```typescript
interface AppStore {
  // Tasks
  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTaskComplete: (id: string) => Promise<void>;
  
  // Schedule
  dailySchedules: DailySchedule[];
  updateDailySchedule: (day: string, schedule: Partial<DailySchedule>) => Promise<void>;
  addMeeting: (day: string, meeting: Omit<Meeting, 'id'>) => Promise<void>;
  removeMeeting: (day: string, meetingId: string) => Promise<void>;
  
  // Computed
  scheduledTasks: ScheduledTask[];
  computeSchedule: () => void;
  
  // UI State
  selectedTaskId: string | null;
  selectedWeek: Date;
  isLoading: boolean;
  error: string | null;
}
```

## IPC Communication Design

### Channels
```typescript
// Main -> Renderer
const CHANNELS = {
  // Tasks
  'task:created': Task,
  'task:updated': Task,
  'task:deleted': string,
  
  // Schedule
  'schedule:updated': DailySchedule,
  
  // System
  'backup:completed': { path: string, timestamp: Date },
  'update:available': { version: string },
} as const;

// Renderer -> Main
const HANDLERS = {
  // Tasks
  'task:create': (task: Omit<Task, 'id'>) => Task,
  'task:update': (id: string, updates: Partial<Task>) => Task,
  'task:delete': (id: string) => void,
  'task:list': (filters?: TaskFilters) => Task[],
  
  // Schedule
  'schedule:get': () => DailySchedule[],
  'schedule:update': (day: string, schedule: Partial<DailySchedule>) => DailySchedule,
  
  // Backup
  'backup:create': () => { path: string },
  'backup:restore': (path: string) => void,
  
  // Export
  'export:csv': (startDate: Date, endDate: Date) => string,
  'export:json': () => string,
} as const;
```

## Key Algorithms

### Task Scheduling Algorithm
```typescript
function scheduleTasksAcrossDays(
  tasks: Task[], 
  dailySchedules: DailySchedule[],
  startDate: Date
): ScheduledTask[] {
  // 1. Sort tasks by priority (importance × urgency)
  // 2. Check dependencies are satisfied
  // 3. For each day:
  //    a. Calculate available focused time (240 min - meetings)
  //    b. Calculate available admin time (180 min - meetings)
  //    c. Assign tasks until capacity reached
  //    d. Handle partial task scheduling
  //    e. Track async process completion dates
  // 4. Return array of scheduled tasks with dates
}
```

### Dependency Resolution
```typescript
function getSchedulableTaskOrder(tasks: Task[]): Task[] {
  // Topological sort considering:
  // 1. Task dependencies
  // 2. Priority scores
  // 3. Async wait times
  // Return ordered list of tasks
}
```

## Database Schema (Prisma)

```prisma
model Task {
  id              String   @id @default(uuid())
  name            String
  duration        Int
  importance      Int
  urgency         Int
  type            String
  asyncWaitTime   Int      @default(0)
  dependencies    String[] // JSON array of task IDs
  completed       Boolean  @default(false)
  completedAt     DateTime?
  actualDuration  Int?
  notes           String?
  projectId       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  project         Project? @relation(fields: [projectId], references: [id])
  scheduledTasks  ScheduledTask[]
}

model Project {
  id          String   @id @default(uuid())
  name        String
  color       String
  createdAt   DateTime @default(now())
  
  tasks       Task[]
}

model DailySchedule {
  id          String   @id @default(uuid())
  dayOfWeek   String   @unique
  startTime   String
  endTime     String
  
  meetings    Meeting[]
}

model Meeting {
  id            String   @id @default(uuid())
  name          String
  startTime     String
  endTime       String
  recurring     Boolean  @default(false)
  scheduleId    String
  
  schedule      DailySchedule @relation(fields: [scheduleId], references: [id])
}

model ScheduledTask {
  id              String   @id @default(uuid())
  taskId          String
  scheduledDate   DateTime
  scheduledMinutes Int
  isPartial       Boolean
  isStart         Boolean
  isEnd           Boolean
  
  task            Task     @relation(fields: [taskId], references: [id])
}
```

## File Structure

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

## Implementation Phases

### Phase 1: Core Functionality (MVP)
1. Basic Electron setup with React
2. Task CRUD operations
3. Simple scheduling algorithm
4. Weekly calendar view
5. Local SQLite persistence
6. Basic schedule configuration

### Phase 2: Enhanced Scheduling
1. Dependency management
2. Async workflow handling  
3. Partial task scheduling
4. Eisenhower matrix view
5. Meeting integration
6. Schedule optimization

### Phase 3: Analytics & Tracking
1. Time tracking functionality
2. Estimation accuracy reports
3. Burndown charts
4. Productivity analytics
5. Export capabilities (CSV, JSON)
6. Backup/restore functionality

### Phase 4: Polish & Advanced Features
1. System tray integration
2. Keyboard shortcuts
3. Dark mode
4. Auto-updater
5. Calendar integration (Google, Outlook)
6. Team sharing capabilities

## Security Considerations

1. **Data Storage**: All data stored locally in user's app data directory
2. **Encryption**: Option to encrypt database with user-provided password
3. **Backups**: Automatic daily backups with configurable retention
4. **Updates**: Signed builds with automatic update checks

## Performance Requirements

1. **Startup Time**: < 2 seconds
2. **Task Scheduling**: < 100ms for 1000 tasks
3. **UI Responsiveness**: 60 FPS for all interactions
4. **Memory Usage**: < 200MB for typical usage
5. **Database Size**: Support up to 10,000 tasks

## Testing Strategy

1. **Unit Tests**: Business logic, scheduling algorithms
2. **Integration Tests**: IPC communication, database operations
3. **E2E Tests**: Critical user workflows
4. **Performance Tests**: Scheduling algorithm with large datasets
5. **Manual Testing**: UI/UX validation

## Development Setup Instructions

```bash
# Clone repository
git clone [repo-url]
cd work-capacity-planner

# Install dependencies
npm install

# Setup database
npx prisma migrate dev

# Development
npm run dev

# Build
npm run build

# Test
npm test
```

## Deployment Strategy

1. **Build Pipeline**: GitHub Actions for CI/CD
2. **Release Process**: Semantic versioning with changelogs
3. **Distribution**: 
   - Direct downloads from GitHub Releases
   - Auto-updater for existing installations
   - Future: Mac App Store, Microsoft Store
4. **Analytics**: Optional, privacy-respecting usage analytics

## Future Enhancements

1. **Mobile Companion App**: View schedule on mobile
2. **AI Integration**: Smart task duration estimation
3. **Team Features**: Share schedules with teammates
4. **Integrations**: Jira, GitHub Issues, Linear
5. **Voice Input**: Quick task entry via voice
6. **Focus Mode**: Pomodoro timer integration
7. **Visual Scheduling Algorithm Builder**: 
   - Drag-and-drop interface for creating custom prioritization algorithms
   - Logic blocks as nodes: topological sort, priority boosters, filters, splitters
   - Visual flow diagram showing how tasks move through the scheduling pipeline
   - Support for conditional branching, loops, and merge points
   - Export/import custom algorithms as JSON for sharing
   - Pre-built templates for common scheduling patterns
   - Real-time preview of how tasks would be scheduled with the custom algorithm

## Success Metrics

1. **Accuracy**: 90% of tasks completed within estimated time
2. **Usage**: Daily active usage by user
3. **Performance**: All operations complete in < 100ms
4. **Reliability**: < 0.1% crash rate
5. **User Satisfaction**: Built-in feedback mechanism

## Key Technical Decisions

1. **SQLite over cloud**: Privacy-first, works offline
2. **Zustand over Redux**: Simpler, less boilerplate
3. **Arco Design + Tailwind**: Professional desktop-focused components with utility styling
4. **Vite over Webpack**: Faster development experience
5. **TypeScript throughout**: Type safety prevents bugs

## References

- [Electron Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [React Performance](https://react.dev/learn/render-and-commit)
- [SQLite Performance](https://www.sqlite.org/optoverview.html)
- [Scheduling Algorithms](https://en.wikipedia.org/wiki/Scheduling_(computing))