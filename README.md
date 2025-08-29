# Work Capacity Planner

An Electron-based task management application with AI-powered task extraction and capacity-based scheduling. Features voice input, intelligent workflow extraction, and priority-based scheduling with dependency resolution.

## 🚀 Features

### AI-Powered Workflow Extraction
- **Claude Opus 4.1**: Extracts structured tasks from natural language
- **Workflow Detection**: Identifies multi-step processes with dependencies and wait times
- **Voice-to-Workflow Pipeline**: Record natural speech and automatically extract complex workflows
- **Audio File Upload**: Upload pre-recorded audio for development and testing
- **Smart Questions**: AI asks clarifying questions instead of making assumptions
- **Context-Aware**: Uses persistent job context and industry jargon for better understanding

### 📋 Advanced Task Management
- **Smart Prioritization**: Eisenhower Matrix with importance × urgency scoring
- **Multi-Step Workflows**: Create complex sequenced tasks with dependencies
- **Async Wait Times**: Model external delays (code reviews, CI/CD, approvals)
- **Task Types**: Distinguish between focused work and administrative tasks
- **Duration Tracking**: Realistic time estimates with capacity-based scheduling
- **Hard Deadlines**: Priority boost for tasks approaching deadlines
- **Workflow Controls**: Start, pause, and reset workflow execution
- **Session Management**: Multiple work contexts with isolated data
- **Batch Operations**: Delete all tasks for development testing (dev mode)

### 🎯 Intelligent Scheduling Engine
- **Multiple Scheduling Modes**:
  - **Optimal Mode**: Mathematical optimization for earliest completion
  - **Balanced Mode**: Respects work-life balance with capacity limits
  - **Manual Mode**: Direct control over task placement
- **Unified Scheduling Logic**: Shared utilities for consistency across modes
- **Topological Sorting**: Automatic dependency resolution with circular detection
- **Critical Path Analysis**: Identifies longest dependency chains for accurate estimates
- **Work Pattern Management**: 
  - Custom work hours per day of week
  - Sleep schedules with proper boundary handling
  - Meeting blocks that are respected during scheduling
  - Flexible block types for optimization
- **Smart Async Handling**: Schedules tasks during async wait times
- **No Weekend Assumptions**: Respects user-defined patterns without hardcoding
- **Capacity-Based Scheduling**: Respects daily focus/admin time limits
- **Deadline Prioritization**: Automatic urgency boosting for approaching deadlines
- **Break Management**: Automatic breaks after continuous work periods
- **Real-time Updates**: Current time indicator and dynamic scheduling

### 🎤 Voice Amendments (Beta)
- **Natural Language Updates**: Update tasks via voice after creation
- **Status Changes**: "Mark the code review as complete"
- **Time Logging**: "I spent 2 hours on the API implementation"
- **Add Notes**: "Note that we need to handle edge cases"
- **Workflow Updates**: Add steps, update durations, modify dependencies
- **High Confidence Parsing**: AI confidence scores for each amendment

### 🧠 Context Management
- **Job Context**: Persistent context about your role and work patterns
- **Voice Memos**: Add context via voice recordings
- **Industry Jargon**: Build a dictionary of domain-specific terms
- **Context Evolution**: Expand and refine context over time

### 💾 Data Persistence
- **Local SQLite Database**: All data persists between sessions
- **Secure Architecture**: Database operations isolated to main process
- **Real-time Sync**: Changes immediately reflected across all views

## 🛠️ Technical Stack

- **Frontend**: React + TypeScript + ArcoDesign
- **Backend**: Electron with secure IPC architecture
- **Database**: SQLite with Prisma ORM
- **AI Services**: 
  - Claude Opus 4.1 (Anthropic) for advanced workflow extraction
  - OpenAI Whisper API for speech-to-text transcription
- **State Management**: Zustand with async operations
- **Testing**: Vitest with React Testing Library
- **Code Quality**: ESLint + TypeScript strict mode

## 📱 User Interface

### Main Views
1. **Task List**: Complete task management with inline editing
2. **Eisenhower Matrix**: Visual priority quadrants with workflow support and zoom controls
3. **Calendar**: Weekly schedule overview  
4. **Workflows**: Multi-step task sequences with visual graph editor
5. **Timeline (Gantt Chart)**: Priority-based timeline with work hours and capacity limits
6. **Work Logger**: Dual-view time tracking with:
   - **Swim Lane Timeline**: Drag-and-drop session creation
   - **24-Hour Clock**: Circular time visualization with arc-based sessions
   - **Real-time Sync**: Bidirectional updates between views
   - **Zoom Controls**: Adjust UI density for better visibility

### AI Integration
- **AI Brainstorm Modal**: Voice recording and transcription
- **Task Creation Flow**: Guided AI-enhanced task creation
- **Context Gathering**: Smart questions for unclear tasks
- **Enhancement Suggestions**: AI-powered improvements

## 🚀 Getting Started

### Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables in `.env`:
   ```
   ANTHROPIC_API_KEY=your_claude_api_key
   OPENAI_API_KEY=your_openai_api_key
   ```
4. Initialize database: `npx prisma generate`
5. Start development: `npm run start`

### Development Commands
```bash
npm run start          # Start development server
npm run build          # Build for production
npm run typecheck      # Run TypeScript type checking (must pass with 0 errors)
npm run lint           # Run ESLint
npm test              # Run test suite
npm run test:ui       # Run tests with UI
npm run test:coverage # Generate test coverage report
npm run prisma:studio # Open Prisma database viewer
npm run prisma:migrate dev # Run database migrations
npm run restart       # Clean restart (kills processes, rebuilds)
npm run check         # Run both typecheck and lint
```

### Usage
1. **Create Tasks**: Click "Add Task" → Choose "AI Brainstorm" for voice input
2. **Record Voice**: Speak naturally about your projects and deadlines
3. **AI Processing**: Claude extracts structured tasks from your speech
4. **Review & Create**: Accept or modify AI suggestions before creating tasks
5. **View Schedule**: Check Timeline view for intelligent work distribution

## 🎯 Workflow Examples

### Async Workflow Extraction
*Record*: "I need to implement a new feature. First I'll analyze the requirements, then write the code. After that I'll submit for code review which usually takes about a day. Once approved, I'll deploy to staging and wait for QA verification."

*AI Extracts Workflow*:
- **Implement New Feature** (7 steps, ~8 hours active work, 2-3 days total)
  1. Analyze requirements (60 min)
  2. Write implementation code (180 min)
  3. Write unit tests (90 min)
  4. Submit for code review (30 min) → Wait 24 hours
  5. Address review feedback (60 min)
  6. Deploy to staging (30 min) → Wait 4 hours for CI/CD
  7. Verify with QA (30 min)

### Simple Task Extraction
*Record*: "I need to finish the quarterly report by Friday, it's high priority. Also need to review the marketing campaign designs."

*AI Extracts Tasks*:
- **Finish Quarterly Report** (High Priority, 4 hours, Due Friday)
- **Review Marketing Designs** (Medium Priority, 2 hours)

### Smart Scheduling
The system automatically:
- Prioritizes the quarterly report for immediate scheduling
- Allocates design review to available focused work time
- Schedules administrative tasks during non-focused periods
- Respects daily capacity limits (4h focused + 3h admin)

## Technical Implementation

### Key Features
- **Interactive Workflow Graph**: Drag-and-drop dependency creation with React Flow
- **Eisenhower Matrix Visualization**: Zoom, filter, and interact with priority quadrants
- **Database-Driven Testing**: Integration tests using actual production data backups
- **Unified Task Model**: Single database table for both simple tasks and workflows
- **TypeScript Strict Mode**: Full type safety with zero tolerance for errors
- **Comprehensive Test Suite**: 100+ tests covering core functionality
- **Debug Tools**: Toggleable debug information for schedule analysis

### Database-Driven Development & Testing

This project uses an effective approach for debugging and testing complex scheduling logic:

1. **Create Real Scenarios**: Build test cases directly in the UI with actual user workflows
2. **Database Backups**: Capture the exact state as SQLite database snapshots
3. **Integration Tests**: Generate tests that load real data and run the same logic as the UI
4. **Perfect Reproduction**: Debug issues with 100% fidelity to user experiences
5. **AI-Assisted Debugging**: Use Claude to analyze database state and generate test cases

This methodology proved particularly valuable for:
- Debugging complex workflow dependency issues
- Ensuring UI and test logic remain synchronized
- Rapidly identifying root causes of scheduling problems
- Creating regression tests from actual user scenarios

## 🔧 Architecture

### Security Model
- **Process Isolation**: Main and renderer processes properly separated
- **Secure IPC**: All AI/database operations via contextBridge
- **API Key Protection**: Environment variables only in main process
- **No Direct Access**: Renderer cannot directly access filesystem or APIs

### Data Flow
```
Voice Input → Whisper API → Claude Analysis → Task Creation → Database → UI Update
```

## 📊 Current Status

### ✅ Complete Features
- Voice recording and speech-to-text transcription
- AI-powered task extraction and enhancement
- Complete task and workflow management
- Smart scheduling with capacity management and deadline prioritization
- Timeline visualization and data persistence
- Session management for multiple work contexts
- Workflow execution controls (start/pause/reset)
- Eisenhower matrix with zoom and workflow support
- Unified task model (workflows and tasks in single table)
- Database migration from dual model completed
- TypeScript strict mode fully enforced (0 errors)
- Comprehensive test suite (78 passing tests)
- Multi-day schedule editor with copy/paste functionality
- Sleep block scheduling for realistic work patterns
- Smart workflow interleaving to prevent schedule monopolization
- Comprehensive error handling and user feedback
- Testing infrastructure with Vitest

### 🎙️ Voice Amendment System ✅
- **Voice-to-Amendment Pipeline**: Record natural speech to update tasks and workflows
- **Claude Opus Integration**: AI-powered understanding with job context awareness
- **Dual Input Modes**: Choose between voice recording or text input
- **Smart Recognition**: Automatically matches task/workflow names from context
- **Amendment Types Fully Supported**:
  - Status updates (mark complete, in progress, waiting, not started)
  - Time logging (record time spent on tasks)
  - Note additions (add context to tasks/workflows)
  - Duration changes (update time estimates)
  - **Workflow step additions** (add new steps with proper ordering and dependencies)
- **Preview & Confirmation**: Review proposed changes before applying
- **IPC-Safe Architecture**: Handles enum serialization across process boundaries
- **Auto-Refresh**: UI updates automatically after amendments are applied

### 🚧 In Development
- **Locked Task Scheduling**: Fixed-time tasks (e.g., meetings at exact times)
- **Enhanced Amendment Feedback**: Edit incorrect interpretations
- **Improved Workflow Step UI**: Better controls for marking steps complete

### 🔮 Future Enhancements
- Data export (CSV/JSON)
- Dark mode theme support
- Keyboard shortcuts and navigation
- Undo/redo functionality
- Advanced search and filtering
- Performance optimizations for 500+ tasks
- Task timing and productivity analytics
- Calendar integration for meetings
- Advanced reporting and insights
- Team collaboration features

## 🤝 Contributing

This project demonstrates modern Electron development with AI integration:
- Secure IPC patterns for AI service integration
- Real-time voice processing in web applications
- Intelligent task management with natural language processing
- Sophisticated scheduling algorithms with constraint satisfaction

---

Built with Electron, React, TypeScript, and Prisma. Development accelerated using Claude Code for AI-assisted debugging and test generation.