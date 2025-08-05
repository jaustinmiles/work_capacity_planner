# Work Capacity Planner

An intelligent Electron-based productivity application that combines AI-powered task creation with smart scheduling and capacity management.

## 🚀 Features

### 🤖 AI-Powered Task Creation
- **Voice-to-Task Pipeline**: Record natural speech and automatically extract structured tasks
- **Intelligent Analysis**: Uses Claude AI to understand context, priorities, and requirements
- **Smart Enhancement**: AI suggests improvements and asks clarifying questions
- **Natural Language Processing**: Speak naturally about projects, deadlines, and priorities

### 📋 Advanced Task Management
- **Smart Prioritization**: Eisenhower Matrix with importance × urgency scoring
- **Multi-Step Workflows**: Create complex sequenced tasks with dependencies
- **Task Types**: Distinguish between focused work and administrative tasks
- **Duration Tracking**: Realistic time estimates with capacity-based scheduling

### 🎯 Intelligent Scheduling
- **Capacity-Aware Distribution**: Automatically distributes work based on daily limits
- **Priority-Driven**: Tasks scheduled by priority scores and dependencies
- **Timeline Visualization**: Gantt-style timeline showing work distribution
- **Smart Allocation**: Handles partial task allocation across multiple days

### 💾 Data Persistence
- **Local SQLite Database**: All data persists between sessions
- **Secure Architecture**: Database operations isolated to main process
- **Real-time Sync**: Changes immediately reflected across all views

## 🛠️ Technical Stack

- **Frontend**: React + TypeScript + ArcoDesign
- **Backend**: Electron with secure IPC architecture
- **Database**: SQLite with Prisma ORM
- **AI Services**: 
  - Anthropic Claude API for task analysis
  - OpenAI Whisper API for speech-to-text
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

### Voice Brainstorming
*Record*: "I need to finish the quarterly report by Friday, it's high priority. Also need to review the marketing campaign designs and schedule team meetings for next week..."

*AI Extracts*:
- **Finish Quarterly Report** (High Priority, 4 hours, Due Friday)
- **Review Marketing Designs** (Medium Priority, 2 hours)  
- **Schedule Team Meetings** (Admin, 1 hour)

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