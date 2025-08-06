# Work Capacity Planner

An intelligent Electron-based productivity application that combines AI-powered task creation with smart scheduling and capacity management.

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
- **Batch Operations**: Delete all tasks for development testing (dev mode)

### 🎯 Intelligent Scheduling
- **Capacity-Aware Distribution**: Automatically distributes work based on daily limits
- **Priority-Driven**: Tasks scheduled by priority scores and dependencies
- **Timeline Visualization**: Gantt-style timeline showing work distribution
- **Smart Allocation**: Handles partial task allocation across multiple days

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
- **Code Quality**: ESLint + TypeScript strict mode

## 📱 User Interface

### Main Views
1. **Task List**: Complete task management with inline editing
2. **Eisenhower Matrix**: Visual priority quadrants
3. **Calendar**: Weekly schedule overview
4. **Workflows**: Multi-step task sequences
5. **Timeline**: Smart scheduling visualization

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
- Smart scheduling with capacity management
- Timeline visualization and data persistence
- Comprehensive error handling and user feedback

### 🔮 Future Enhancements
- Workflow execution tracking
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