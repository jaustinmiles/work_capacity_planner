# Work Capacity Planner - Architecture Documentation

**Last Updated:** September 4, 2025  
**Version:** 4.0.0 (Post PR #55 - Responsive Design Implementation)

## Overview

Work Capacity Planner is an Electron-based desktop application for managing software engineer workload using capacity-based scheduling with a focus on asynchronous workflows. The application helps engineers plan their work around async wait times (code reviews, CI/CD pipelines, approvals) and optimize their productivity.

## Core Architecture

### Technology Stack

- **Desktop Framework:** Electron 26+
- **Frontend:** React 19 with TypeScript 5.0+ (strict mode)
- **UI Components:** Arco Design + Tailwind CSS
- **Responsive Design:** Container queries + ResponsiveProvider context
- **State Management:** Zustand with session-aware persistence
- **Database:** SQLite with Prisma ORM
- **Build System:** Vite
- **Testing:** Vitest + React Testing Library + Playwright E2E
- **AI Services:** Claude Opus 4.1 + OpenAI Whisper API
- **Type Safety:** Comprehensive enum system with exhaustive checking

### Process Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│  - Database operations (Prisma)                          │
│  - IPC handlers with enum serialization handling         │
│  - Window management                                     │
│  - AI service integration (Claude + Whisper)             │
│  - Amendment parsing with job context                    │
│  - Centralized logging system (file + database)          │
│  - Error persistence to database                         │
└───────────────┬─────────────────────────────────────────┘
                │
                │ IPC via Preload Script (contextBridge)
                │ ⚠️ Enums serialize to strings
                │
┌───────────────▼─────────────────────────────────────────┐
│                  Electron Renderer Process               │
│  - React application                                     │
│  - Zustand store with task/workflow state                │
│  - UI components (Arco Design)                           │
│  - Scheduling algorithms (3 modes: optimal/balanced/manual)│
│  - Voice amendment UI                                    │
│  - Advanced developer tools (LogViewer, PR tracker)      │
│  - Eisenhower scatter plot with clustering               │
└─────────────────────────────────────────────────────────┘
```

### Data Flow Patterns

#### 1. Standard CRUD Operations
```
User Action → React Component → Zustand Store → IPC Call → Main Process → Database → IPC Response → Store Update → UI Re-render
```

#### 2. Voice Amendment Flow
```
Voice Recording → Whisper Transcription → Claude Parsing (with Job Context) → Amendment Objects → Apply to Database → Auto-refresh UI
```

#### 3. AI Task Extraction
```
Voice/Text Input → Whisper API → Claude Analysis → Structured Tasks/Workflows → Database → UI Update
```

## Database Design

### Unified Task Model ✅

**Current State:** Successfully migrated to unified model where workflows are Tasks with `hasSteps: true`.

```prisma
model Task {
  id                    String    @id
  name                  String
  duration              Int       // Total duration in minutes
  hasSteps              Boolean   @default(false)
  
  // Workflow-specific fields (when hasSteps = true)
  criticalPathDuration  Int?      
  worstCaseDuration     Int?      
  currentStepId         String?   
  overallStatus         String    @default("not_started")
  
  // Core task fields
  importance            Int
  urgency               Int
  type                  String    // "focused" | "admin"
  asyncWaitTime         Int       @default(0)
  dependencies          String    // JSON array of task IDs
  
  // Tracking
  completed             Boolean   @default(false)
  completedAt           DateTime?
  actualDuration        Int?
  notes                 String?
  
  // Relations
  TaskStep              TaskStep[] @relation("TaskSteps")
  WorkSession           WorkSession[]
  sessionId             String
  Session               Session    @relation(fields: [sessionId])
}

model TaskStep {
  id               String    @id
  taskId           String    // Parent task/workflow
  name             String
  duration         Int
  type             String    // "focused" | "admin"
  dependsOn        String    // JSON array of step IDs
  asyncWaitTime    Int       @default(0)
  status           String    @default("pending")
  stepIndex        Int       // Order in workflow
  percentComplete  Int       @default(0)
  notes            String?   // Step-specific notes
  
  // Tracking
  actualDuration   Int?
  startedAt        DateTime?
  completedAt      DateTime?
  
  Task             Task      @relation("TaskSteps", fields: [taskId])
}

model WorkSession {
  id             String       @id
  taskId         String
  stepId         String?
  patternId      String?
  type           String
  startTime      DateTime
  endTime        DateTime?
  plannedMinutes Int          @default(0)
  actualMinutes  Int?
  notes          String?
  createdAt      DateTime     @default(now())
  WorkPattern    WorkPattern? @relation(fields: [patternId], references: [id])
  Task           Task         @relation(fields: [taskId], references: [id], onDelete: Cascade)
  @@index([startTime])
  @@index([taskId])
}

model Session {
  id          String    @id
  name        String
  createdAt   DateTime  @default(now())
  isActive    Boolean   @default(false)
  
  Task        Task[]
  WorkPattern WorkPattern[]
  JobContext  JobContext[]
}

model JobContext {
  id                String    @id
  sessionId         String
  role              String?
  context           String?   // General work context
  jargonDictionary  String?   // JSON: domain-specific terms
  
  Session           Session   @relation(fields: [sessionId])
}
```

## Component Architecture

### Main Process Services

```
src/main/
├── index.ts              # IPC handlers, app lifecycle
├── database.ts           # DatabaseService singleton
│   ├── Task CRUD operations
│   ├── Workflow step management
│   ├── Work session tracking
│   ├── Job context management
│   └── Session isolation
└── services/
    ├── ai-service.ts     # Claude Opus integration
    └── speech-service.ts # Whisper API integration
```

### Renderer Process Structure (ACTUAL CURRENT STATE)

```
src/renderer/
├── components/
│   ├── ai/
│   │   └── BrainstormModal.tsx           # Voice-to-task extraction
│   ├── voice/
│   │   └── VoiceAmendmentModal.tsx       # Voice amendments UI
│   ├── tasks/
│   │   ├── TaskList.tsx                  # Main task list
│   │   ├── UnifiedTaskEdit.tsx           # Task editing (unified model)
│   │   ├── SequencedTaskView.tsx         # Workflow viewing
│   │   ├── TaskStepItem.tsx              # Individual step display
│   │   ├── EisenhowerMatrix.tsx          # Priority matrix container
│   │   ├── EisenhowerGrid.tsx            # Grid view
│   │   ├── EisenhowerScatter.tsx         # Scatter plot view
│   │   ├── TaskTimeLoggingModal.tsx      # Basic time logging
│   │   └── StepWorkSessionsModal.tsx     # Step-specific sessions
│   ├── schedule/
│   │   ├── ScheduleGenerator.tsx         # Schedule generation
│   │   └── TimelineVisualizer.tsx       # Timeline visualization
│   ├── timeline/
│   │   ├── GanttChart.tsx               # Gantt chart component
│   │   └── DeadlineViolationBadge.tsx   # Deadline indicators
│   ├── calendar/
│   │   └── WeeklyCalendar.tsx           # Weekly view
│   ├── work-logger/
│   │   ├── SwimLaneTimeline.tsx         # Circadian rhythm view
│   │   ├── WorkLoggerDual.tsx           # Dual productivity view
│   │   └── WorkLoggerCalendar.tsx       # Calendar-based logging
│   ├── progress/
│   │   └── WorkflowProgressTracker.tsx  # Step progress tracking
│   ├── dev/
│   │   ├── LogViewer.tsx                # Debug log viewer
│   │   ├── DevTools.tsx                 # Developer tools panel
│   │   └── FeedbackViewer.tsx           # Feedback management
│   └── session/
│       └── SessionManager.tsx           # Session management
├── store/
│   └── useTaskStore.ts                   # Zustand state management
├── services/
│   └── database.ts                       # IPC wrapper for DB calls
└── utils/
    ├── flexible-scheduler.ts             # UI scheduler (GanttChart/Calendar)
    ├── deadline-scheduler.ts             # Priority calculations
    ├── scheduling.ts                     # Core scheduling algorithms
    └── amendment-applicator.ts          # Apply voice amendments
```

### Shared Types and Utilities

```
src/shared/
├── types.ts                # Core type definitions
├── enums.ts                # Centralized enums
├── amendment-types.ts      # Voice amendment types
├── amendment-parser.ts     # Claude parsing logic
└── step-id-utils.ts        # Step ID generation
```

## Key Architectural Patterns

### 1. IPC Communication Pattern

**Critical:** Enums become strings when serialized through IPC.

```typescript
// Main process sends enum
{ type: AmendmentType.StepAddition } // Enum value

// Renderer receives string
{ type: 'step_addition' } // String literal

// Solution: Handle both in UI
switch (amendment.type) {
  case 'step_addition':
  case AmendmentType.StepAddition:
    // Handle step addition
}
```

### 2. Database Service Singleton

```typescript
class DatabaseService {
  private static instance: DatabaseService
  private client: PrismaClient
  
  static getInstance(): DatabaseService {
    if (!this.instance) {
      this.instance = new DatabaseService()
    }
    return this.instance
  }
  
  // All DB operations go through this service
}
```

### 3. Session Isolation

All database queries filter by active session:

```typescript
async getTasks(): Promise<Task[]> {
  const sessionId = await this.getActiveSession()
  return this.client.task.findMany({
    where: { sessionId },
    include: { TaskStep: true }
  })
}
```

### 4. Unified Task Formatting

The `formatTask` method ensures UI compatibility:

```typescript
private formatTask(task: any): any {
  if (task.hasSteps) {
    // Format as SequencedTask for UI
    return {
      ...task,
      steps: task.TaskStep || [],
      totalDuration: task.duration,
      overallStatus: task.overallStatus || 'not_started'
    }
  }
  return task
}
```

## Voice Amendment System

### Architecture Flow

```
1. Voice Recording (MediaRecorder API)
   ↓
2. Audio Processing (Blob → ArrayBuffer)
   ↓
3. Transcription (Whisper API via IPC)
   ↓
4. Amendment Parsing (Claude Opus with Job Context)
   ↓
5. Amendment Display (Handle enum serialization)
   ↓
6. Amendment Application (Database modifications)
   ↓
7. UI Auto-refresh (Zustand store update)
```

### Supported Amendment Types

- **StatusUpdate**: Change task/workflow status
- **TimeLog**: Record time spent
- **NoteAddition**: Add notes to items
- **DurationChange**: Update time estimates
- **StepAddition**: Add steps to workflows ✅
- **StepRemoval**: Remove workflow steps (TODO)
- **DependencyChange**: Modify dependencies (TODO)
- **TaskCreation**: Create new tasks (TODO)
- **WorkflowCreation**: Create workflows (TODO)

## Scheduling Engine

### Core Algorithm

1. **Topological Sort**: Resolve dependencies
2. **Priority Calculation**: importance × urgency
3. **Capacity Allocation**: Respect daily limits
4. **Smart Interleaving**: Prevent workflow monopolization
5. **Async Gap Filling**: Utilize wait times
6. **Deadline Boosting**: Prioritize near deadlines

### Capacity Model

```typescript
interface DailyCapacity {
  focusMinutes: number    // Deep work capacity
  adminMinutes: number    // Admin work capacity
  meetingMinutes: number  // Fixed meetings
  breakMinutes: number    // Required breaks
}
```

## Security Considerations

### Process Isolation
- Database operations restricted to main process
- Renderer can only access DB via IPC
- Preload script uses contextBridge for security

### Data Protection
- Local SQLite database (no network exposure)
- Session isolation for multi-project support
- No sensitive data in renderer process

## Performance Optimizations

### Current Optimizations
- Lazy loading of workflow steps
- Debounced UI updates
- Efficient task formatting
- Cached session lookups

### Future Optimizations
- Virtual scrolling for large task lists
- Worker threads for complex scheduling
- Database query optimization
- Voice recording compression

## Testing Strategy

### Test Coverage
- **Unit Tests**: Core algorithms, utilities
- **Integration Tests**: Database operations
- **Component Tests**: React components
- **E2E Tests**: Critical user flows (planned)

### Key Test Files
```
src/main/__tests__/
  ├── database-unified.test.ts
  ├── database-workflow-protection.test.ts
  └── work-sessions.test.ts

src/renderer/__tests__/
  └── voice-amendment-integration.test.tsx

src/shared/__tests__/
  ├── amendment-parser.test.ts
  └── amendment-parser-edge-cases.test.ts
```

## Deployment Architecture

### Build Process
1. TypeScript compilation (strict mode)
2. Vite bundling for renderer
3. Electron Builder packaging
4. Code signing (planned)
5. Auto-update integration (planned)

### Distribution
- **macOS**: DMG installer
- **Windows**: NSIS installer (planned)
- **Linux**: AppImage (planned)

## INCOMPLETE REFACTORINGS

### ⚠️ Critical: These refactorings were attempted but NOT completed

#### 1. Scheduler Unification (ATTEMPTED, NOT COMPLETED)
**Attempted Goal**: Merge flexible-scheduler, deadline-scheduler, and scheduling-engine into one system
**Current Reality**: 
- GanttChart/WeeklyCalendar still use `flexible-scheduler.ts`
- `deadline-scheduler.ts` still provides priority calculations
- `scheduling-engine.ts` exists but is separate system
- Different priority formulas between systems (BUG)
- 20+ tests skipped with "needs rewrite for unified scheduler" comments

#### 2. Work Session Consolidation (PARTIALLY COMPLETED)
**Goal**: Unify 5 different session types into UnifiedWorkSession
**Status**: 
- ✅ `UnifiedWorkSession` type created with migration adapters
- ❌ Most UI components still use old session types
- ❌ Database operations not fully migrated
- ❌ Multiple session interfaces still exist

**Remaining Session Types Still in Use:**
1. `LocalWorkSession` in useTaskStore.ts
2. `WorkSession` in workflow-progress-types.ts  
3. `WorkSession` in work-blocks-types.ts
4. `WorkSession` in WorkLoggerCalendar.tsx
5. `WorkSession` in WorkSessionsModal.tsx

#### 3. Console.log Replacement (CLAIMED COMPLETE, NOT DONE)
**Claimed**: "All console.log statements replaced with logger"
**Reality**: Scripts directory still contains hundreds of console.log statements
**Verification**: `grep -r "console\.log" scripts/` shows extensive usage

#### 4. Test Migration for Unified Systems (INCOMPLETE)
**Issue**: 20+ tests marked as "needs rewrite for unified scheduler"
**Status**: Tests skipped rather than migrated to new systems
**Files affected**: Multiple test files in scheduling and workflow areas

## Known Architectural Decisions

### 1. Unified Task Model
**Decision**: Merge Task and SequencedTask into single model  
**Rationale**: Simpler data model, fewer synchronization issues  
**Trade-off**: UI compatibility layer needed  

### 2. IPC for All DB Operations
**Decision**: Renderer never directly accesses database  
**Rationale**: Security, process isolation  
**Trade-off**: Additional complexity in IPC handlers  

### 3. Enum System
**Decision**: Comprehensive enums despite IPC serialization  
**Rationale**: Type safety, exhaustive checking  
**Trade-off**: Must handle both enums and strings in UI  

### 4. Local-First Design
**Decision**: SQLite with no cloud sync  
**Rationale**: Privacy, offline capability, simplicity  
**Trade-off**: No multi-device sync  

## Future Architecture Considerations

### Planned Enhancements
1. **Cloud Sync**: Optional encrypted backup
2. **Plugin System**: Custom scheduling algorithms
3. **Team Features**: Shared workflows
4. **Mobile Companion**: View-only mobile app
5. **API Integration**: JIRA, GitHub, etc.

## Logging System Architecture (NEW in v3.0)

### Dual-Layer Logging
```
┌─────────────────────────────────────────────────────────┐
│                    Ring Buffer (Memory)                  │
│  - Last 1000 log entries                                 │
│  - Fast access for development                           │
│  - Cleared on app restart                                │
└───────────────┬─────────────────────────────────────────┘
                │
                │ Error logs persisted
                │
┌───────────────▼─────────────────────────────────────────┐
│                  ErrorLog Database Table                 │
│  - Permanent storage of errors                           │
│  - Session-based querying                                │
│  - Stack traces preserved                                │
│  - Pattern analysis capabilities                         │
└─────────────────────────────────────────────────────────┘
```

### LogViewer Features
- **Pattern Detection**: Groups similar errors automatically
- **Hide/Show Patterns**: Filter out noise with one click
- **Session Switching**: View logs from previous sessions (pending IPC implementation)
- **React Table**: Stable keys for proper reconciliation

## Responsive Design Architecture (PR #55)

### Core Responsive System

#### ResponsiveProvider Context
```typescript
// Centralized viewport state management
interface ViewportState {
  width: number
  height: number
  breakpoint: 'mobile' | 'tablet' | 'desktop' | 'wide'
}
```

#### Container Query Pattern
```typescript
// useContainerQuery hook for component-level responsiveness
const { width, height } = useContainerQuery(containerRef)
// Components adapt to container size, not just viewport
```

#### Breakpoint System
- **Mobile**: < 640px
- **Tablet**: 640px - 1024px  
- **Desktop**: 1024px - 1440px
- **Wide**: > 1440px

### Responsive Components

#### Grid Layouts
- **Arco Grid**: Responsive column spans per breakpoint
- **Container Queries**: Component-specific responsive behavior
- **Fluid Typography**: em/rem units with CSS clamp()
- **Percentage Positioning**: True responsiveness in scatter plots

#### Key Implementations
1. **EisenhowerMatrix**: Container-aware scatter plot
2. **TaskList**: Responsive table with column visibility
3. **WorkScheduleModal**: Adaptive layout for schedule editing
4. **GanttChart**: Horizontal scrolling with fixed headers
5. **Navigation**: Collapsible sidebar on mobile

### E2E Testing Strategy

#### Playwright Configuration
```typescript
// 7 viewport configurations tested
const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
  // ... more viewports
]
```

#### Test Coverage
- Component rendering at all breakpoints
- Interactive elements remain accessible
- Text readability across sizes
- Touch targets meet minimum size (44x44px)

## UI Component Improvements (PR #51)

### Eisenhower Matrix Enhancements
- **Scatter Plot Mode**: Visual representation of task priority distribution
- **Diagonal Scan Animation**: Animated priority ordering from high to low
- **Task Clustering**: Numbered badges for overlapping items
- **Responsive Sizing**: Container-aware dimensions with minHeight safeguards

### Session Management
- **Auto-load Last Session**: Persists last used session to localStorage
- **No Flash on Startup**: Session loaded before default data initialization

### Technical Debt (Resolved)
- ✅ Unified task model migration
- ✅ TypeScript strict mode compliance
- ✅ Voice amendment implementation
- ✅ IPC serialization handling
- ✅ React Table reconciliation issues
- ✅ Container height collapse bugs
- ✅ Script organization into subdirectories
- ✅ Responsive design implementation (PR #55)
- ✅ Container-aware component sizing
- ✅ E2E test coverage with Playwright

### Remaining Technical Debt
**Note:** All unresolved items migrated to `context/feedback.json`. Run `node scripts/analysis/feedback-utils.js unresolved` to view current issues.

---

*This architecture represents the current state after the successful implementation of responsive design (PR #55), voice amendment system, and unified task model migration.*