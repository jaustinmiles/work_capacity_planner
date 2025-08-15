# Voice Amendment & Logging Feature Design

## Overview
Design specification for adding voice-based workflow amendments and time logging capabilities to the Work Capacity Planner application.

## User Story
"As a user, I want to speak changes to my workflows and tasks so that I can quickly update my work status without interrupting my flow. The app should transcribe my voice input, show me a summary of proposed changes, and let me approve or modify them before applying."

## Current Infrastructure

### Existing Capabilities
1. **Speech-to-Text (Whisper API)**
   - Service: `src/shared/speech-service.ts`
   - Supports: MP3, WAV, WebM, MP4, M4A
   - Max file size: 25MB
   - Features:
     - Audio file transcription
     - Buffer transcription
     - Format validation
     - Context-aware prompts for different use cases

2. **AI Processing (Claude Opus 4.1)**
   - Service: `src/shared/ai-service.ts`
   - Capabilities:
     - Extract tasks from natural language
     - Generate workflows with dependencies
     - Understand async wait times
     - Context-aware processing with job context

3. **Existing Voice Features**
   - BrainstormModal: Voice recording for task/workflow creation
   - Uses MediaRecorder API for browser recording
   - Saves recordings to temp directory

## Proposed Architecture

### 1. Voice Amendment Flow
```
User speaks → Record audio → Transcribe → Parse intent → Generate changes → Preview → Apply
```

### 2. Key Components Needed

#### A. VoiceAmendmentModal
- **Purpose**: Capture voice input for workflow/task updates
- **Features**:
  - Recording interface with visual feedback
  - Real-time transcription display
  - Intent recognition (update vs log time vs add note)
  
#### B. AmendmentParser Service
- **Purpose**: Convert transcribed text to structured amendments
- **Capabilities**:
  - Detect amendment type (status update, time log, note addition)
  - Extract workflow/task references
  - Parse time durations and timestamps
  - Handle ambiguous references

#### C. Amendment Preview Component
- **Purpose**: Show proposed changes before applying
- **Features**:
  - Side-by-side comparison (current vs proposed)
  - Editable fields for corrections
  - Confidence indicators for parsed data
  - Undo/redo support

### 3. Amendment Types

#### A. Status Updates
- "Mark data mining step as complete"
- "I finished the code review"
- "Pause the deployment workflow"

#### B. Time Logging
- "I spent 2 hours on the API implementation"
- "The meeting ran 30 minutes over"
- "Worked on bug fixes from 2 to 4 PM"

#### C. Adding Notes/Context
- "Add note to workflow: waiting for security approval"
- "The database migration had issues with foreign keys"
- "TODO: need to revisit the cache implementation"

#### D. Workflow Modifications
- "Add a new step after testing for documentation"
- "The code review will take 3 hours not 1"
- "Skip the optional verification step"

### 4. Implementation Plan

#### Phase 1: Core Infrastructure (Week 1)
1. Create AmendmentParser service
2. Design amendment data structures
3. Build intent recognition logic
4. Add workflow/task name fuzzy matching

#### Phase 2: Voice Recording UI (Week 1)
1. Create VoiceAmendmentModal component
2. Add recording controls and feedback
3. Implement real-time transcription display
4. Add quick amendment type selection

#### Phase 3: Preview & Application (Week 2)
1. Build Amendment Preview component
2. Implement change validation
3. Add undo/redo functionality
4. Create amendment history tracking

#### Phase 4: Advanced Features (Week 2)
1. Multi-step amendments in one recording
2. Contextual suggestions
3. Voice command shortcuts
4. Batch time logging

## Technical Requirements

### 1. New Dependencies
- None required (existing infrastructure sufficient)

### 2. Database Schema Updates
```prisma
model Amendment {
  id              String   @id @default(cuid())
  taskId          String?
  workflowId      String?
  stepId          String?
  type            String   // 'status' | 'time_log' | 'note' | 'modification'
  originalValue   Json?
  newValue        Json
  transcription   String
  confidence      Float
  applied         Boolean  @default(false)
  createdAt       DateTime @default(now())
  sessionId       String
}
```

### 3. API Endpoints
```typescript
// Main process handlers
- 'amendment:parse': Parse transcription to amendments
- 'amendment:preview': Generate preview of changes
- 'amendment:apply': Apply approved amendments
- 'amendment:history': Get amendment history
```

### 4. State Management
```typescript
interface AmendmentState {
  recording: boolean
  transcription: string
  amendments: Amendment[]
  preview: AmendmentPreview | null
  history: Amendment[]
}
```

## UI/UX Considerations

### 1. Access Points
- Floating action button when viewing workflows
- Keyboard shortcut (Cmd+Shift+V)
- Context menu on workflow/task items
- Dedicated menu item in sidebar

### 2. Visual Feedback
- Recording indicator with waveform
- Real-time transcription display
- Confidence highlighting in preview
- Success/error animations

### 3. Error Handling
- Ambiguous references → Show suggestions
- Low confidence → Highlight for review
- Multiple matches → Selection dialog
- Failed parsing → Manual edit option

## Example Interactions

### Example 1: Update Workflow Status
```
User: "I just finished the data mining step and started on code authoring"
System:
  ✓ Mark "Data Mining" as complete
  ✓ Mark "Code Authoring" as in progress
  ? Log 2 hours on "Data Mining"? [suggested]
```

### Example 2: Log Time
```
User: "Spent 3 and a half hours on the API implementation today"
System:
  ✓ Log 3h 30m on "API Implementation" for today
  ✓ Update actual duration from estimate
```

### Example 3: Add Context
```
User: "Add note to deployment workflow: waiting for staging environment to be ready, probably tomorrow morning"
System:
  ✓ Add note to "Deployment Workflow"
  ? Set async wait time to 18 hours? [suggested]
```

## Performance Considerations

1. **Transcription Caching**: Cache recent transcriptions for undo/redo
2. **Fuzzy Matching**: Pre-index workflow/task names for fast lookup
3. **Streaming**: Show partial results during transcription
4. **Batching**: Group multiple amendments for single database transaction

## Security & Privacy

1. **Audio Storage**: Temporary only, deleted after processing
2. **Transcription**: No PII in prompts to AI services
3. **History**: Amendment history limited to 30 days
4. **Permissions**: Respect session boundaries

## Success Metrics

1. **Accuracy**: >90% correct intent recognition
2. **Speed**: <3 seconds from recording end to preview
3. **Adoption**: >50% of users try feature in first week
4. **Retention**: >30% regular usage after 1 month

## Future Enhancements

1. **Voice Navigation**: "Show me the deployment workflow"
2. **Voice Queries**: "How much time left on current task?"
3. **Voice Reports**: "What did I complete today?"
4. **Multi-language**: Support beyond English
5. **Custom Commands**: User-defined voice shortcuts
6. **Team Sync**: Share voice notes with team members

## Testing Strategy

1. **Unit Tests**: Amendment parser logic
2. **Integration Tests**: End-to-end voice flow
3. **Fuzzy Matching Tests**: Name recognition accuracy
4. **Performance Tests**: Large workflow handling
5. **User Testing**: Real-world voice samples

## Rollout Plan

1. **Beta Feature Flag**: Enable for select users
2. **Feedback Collection**: In-app feedback widget
3. **Iterative Improvements**: Weekly updates based on usage
4. **Full Release**: After 95% accuracy achieved