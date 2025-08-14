# Work Capacity Planner 🚀

**A Revolutionary Task Management System Built Through Groundbreaking AI-Human Collaboration**

An intelligent Electron-based productivity application that combines AI-powered task creation with smart scheduling and capacity management. Built in ~60 hours through intense collaboration between a human developer and Claude, achieving what would traditionally take months or even a year.

## 🚀 Features

### 🤖 AI-Powered Workflow Extraction
- **Claude Opus 4.1**: Advanced AI model specifically tuned for async workflow understanding
- **Workflow-First Mode**: Intelligently extracts multi-step workflows with dependencies and wait times
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
- **Topological Sorting**: Automatic dependency resolution for complex workflows
- **Priority-Based Gantt Chart**: Visual timeline with urgency × importance ordering
- **Work Hours Management**: Configurable daily work hours with lunch breaks
- **Multi-Day Schedule Editor**: Visual calendar for managing schedules across multiple days
- **Copy/Paste Schedules**: Duplicate schedules between days with one click
- **Sleep Block Support**: Cross-midnight scheduling for realistic work patterns
- **Capacity-Based Scheduling**: Respects daily focus/admin time limits
- **Blocked Time Slots**: Mark unavailable times for meetings or commitments
- **Smart Interleaving**: Prevents workflows from monopolizing schedule
- **Async-Aware Packing**: Efficiently fills time during async wait periods
- **Infinite Scroll Timeline**: Zoom controls with guaranteed minimum block sizes
- **Real-time Updates**: Current time indicator and dynamic scheduling
- **Deadline Prioritization**: Automatic urgency boosting for approaching deadlines
- **Critical Path Calculation**: Accurate time estimates for complex workflows

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

## 🏆 Technical Achievements

### Advanced Features Implemented
- **Interactive Workflow Graph**: Drag-and-drop dependency creation with React Flow
- **Eisenhower Matrix Visualization**: Zoom, filter, and interact with priority quadrants
- **Database Backup Integration Tests**: Novel testing approach using real production data
- **Unified Task/Workflow Model**: Seamless handling of simple and complex tasks
- **TypeScript Strict Mode**: Zero tolerance for type errors across ~15,000 lines
- **Comprehensive Test Suite**: 116+ tests ensuring reliability
- **Advanced Debugging Tools**: Toggleable debug info for scheduling analysis

### 🤝 AI-Human Collaboration Innovation

This project pioneers a new development paradigm:
1. **UI Workflow Creation**: Human creates test scenarios in the actual app
2. **Database Persistence**: State is captured in SQLite database
3. **Test Case Replication**: AI generates integration tests from real data
4. **Visual Confirmation**: Human verifies behavior matches expectations
5. **Perfect Alignment**: Tests and UI use identical logic and data

This approach achieved in ~60 hours what would traditionally take months, demonstrating the power of human creativity combined with AI capabilities.

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

### 🚧 In Development
- **Locked Task Scheduling**: Fixed-time tasks (e.g., meetings at exact times)
- **Voice Progress Tracking**: Update task progress via voice
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

**Built with** ❤️ **using Claude Code for rapid AI-enhanced development**