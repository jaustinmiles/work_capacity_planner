# Workflow Progress Tracking & Voice Editing Feature Plan

## Overview

This feature enables users to track progress on workflows, log actual time spent, and update workflows using voice commands processed by Claude Opus. The system will provide insights on time estimation accuracy and remaining work visualization.

## Core Requirements

### 1. Progress Tracking
- Mark individual workflow steps as completed
- Log actual time spent on each step
- Track partial completion of steps
- Support for pausing/resuming work on steps

### 2. Time Analytics
- Compare estimated vs actual time
- Aggregate historical data for accuracy insights
- Calculate remaining work (hours and elapsed time)
- Show percentage completion

### 3. Voice-Based Workflow Editing
- Natural language updates via voice recording
- AI-powered change detection and application
- Visual diff of before/after workflow states
- Confirmation workflow for changes

### 4. Manual Editing Capabilities
- Edit step durations
- Mark steps complete/incomplete
- Add notes to steps
- Reorder or modify dependencies

## Data Model Changes

### 1. Update TaskStep Model
```prisma
model TaskStep {
  // Existing fields...
  
  // Progress tracking
  actualDuration    Int?        // Actual minutes spent
  startedAt         DateTime?   // When work began
  completedAt       DateTime?   // When marked complete
  percentComplete   Int         @default(0) // 0-100
  
  // Work sessions
  workSessions      WorkSession[]
}

model WorkSession {
  id                String      @id @default(cuid())
  taskStepId        String
  taskStep          TaskStep    @relation(fields: [taskStepId], references: [id])
  
  startTime         DateTime
  endTime           DateTime?
  duration          Int         // Minutes worked
  notes             String?
  
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
}
```

### 2. Add TimeEstimateAccuracy Model
```prisma
model TimeEstimateAccuracy {
  id                String      @id @default(cuid())
  sessionId         String
  session           Session     @relation(fields: [sessionId], references: [id])
  
  taskType          String      // 'focused' | 'admin'
  workflowCategory  String?     // Optional categorization
  
  estimatedMinutes  Int
  actualMinutes     Int
  variance          Float       // Percentage variance
  
  createdAt         DateTime    @default(now())
}
```

## UI Components

### 1. WorkflowProgressTracker
- Visual progress bar for overall workflow
- Individual step progress indicators
- Time spent vs estimated display
- Quick complete/start/pause buttons

### 2. TimeLoggingModal
- Log time for completed work
- Add notes about the work session
- Quick presets (30min, 1hr, 2hr, etc.)
- Manual time entry

### 3. WorkflowComparisonView
- Side-by-side before/after visualization
- Highlighted changes
- Graph representation of both states
- Accept/reject changes UI

### 4. VoiceWorkflowEditor
- Recording interface
- Transcription display
- AI processing status
- Change preview before applying

## Voice Command Examples

### Supported Commands
```
"I completed the first two steps of the deployment workflow"
"The code review step took 3 hours instead of 1"
"Add a new step after testing for documentation updates"
"The third step needs more time, make it 4 hours"
"I'm 50% done with the implementation step"
"Pause work on the current step"
```

### AI Prompt Engineering
```typescript
const WORKFLOW_UPDATE_PROMPT = `
You are helping update a software workflow based on voice input.
Current workflow state: {currentWorkflow}
Voice transcript: {transcript}

Extract the following changes:
1. Completed steps (with actual time if mentioned)
2. Duration updates
3. New steps to add
4. Steps to remove or modify
5. Progress updates (partial completion)

Return JSON:
{
  "completedSteps": [{"stepId": "...", "actualMinutes": 180}],
  "durationUpdates": [{"stepId": "...", "newDuration": 240}],
  "newSteps": [...],
  "progressUpdates": [{"stepId": "...", "percentComplete": 50}]
}
`;
```

## Implementation Plan

### Phase 1: Data Model & Basic UI (Week 1)
1. Update Prisma schema
2. Create migration
3. Build WorkflowProgressTracker component
4. Implement time logging UI
5. Add completion tracking to store

### Phase 2: Time Analytics (Week 1-2)
1. Create accuracy calculation service
2. Build analytics dashboard component
3. Implement historical data aggregation
4. Add estimation improvement suggestions

### Phase 3: Voice Integration (Week 2)
1. Create VoiceWorkflowEditor component
2. Implement AI prompt for workflow updates
3. Build change detection logic
4. Create visual diff component

### Phase 4: Testing & Polish (Week 2-3)
1. Unit tests for all new components
2. Integration tests for voice flow
3. E2E tests for complete workflow
4. Performance optimization

## Test Strategy

### Unit Tests
```typescript
describe('WorkflowProgressTracker', () => {
  it('calculates correct completion percentage')
  it('aggregates time from work sessions')
  it('handles partial step completion')
  it('updates parent workflow status')
})

describe('TimeAccuracyService', () => {
  it('calculates variance correctly')
  it('aggregates by task type')
  it('provides meaningful insights')
  it('handles edge cases (0 estimates)')
})
```

### Integration Tests
```typescript
describe('Voice Workflow Updates', () => {
  it('processes completion commands')
  it('handles duration updates')
  it('detects new step additions')
  it('generates accurate diffs')
  it('rolls back on rejection')
})
```

### E2E Tests
```typescript
describe('Complete Workflow Update Flow', () => {
  it('user can mark steps complete')
  it('voice updates apply correctly')
  it('time tracking persists')
  it('analytics update in real-time')
})
```

## Type Safety Strategy

### 1. Strict Types for Updates
```typescript
interface WorkflowUpdate {
  type: 'COMPLETE_STEP' | 'UPDATE_DURATION' | 'ADD_STEP' | 'UPDATE_PROGRESS';
  stepId?: string;
  data: CompleteStepData | UpdateDurationData | AddStepData | UpdateProgressData;
}

interface CompleteStepData {
  actualMinutes: number;
  notes?: string;
}

interface UpdateDurationData {
  newDuration: number;
  reason?: string;
}
```

### 2. Zod Validation for AI Responses
```typescript
const WorkflowUpdateSchema = z.object({
  completedSteps: z.array(z.object({
    stepId: z.string(),
    actualMinutes: z.number().optional()
  })),
  durationUpdates: z.array(z.object({
    stepId: z.string(),
    newDuration: z.number()
  })),
  // ... etc
});
```

## Performance Considerations

1. **Debounce voice processing** - Wait for pause in speech
2. **Optimistic UI updates** - Show changes immediately
3. **Background sync** - Save work sessions asynchronously
4. **Efficient queries** - Aggregate time data in database
5. **Memoize calculations** - Cache completion percentages

## Security & Privacy

1. **Voice recordings** - Store temporarily, delete after processing
2. **Work session data** - Encrypt sensitive notes
3. **Time tracking** - Allow anonymous mode
4. **AI processing** - No PII in prompts

## Success Metrics

1. **Accuracy Improvement** - 20% better estimates after 10 workflows
2. **Time Saved** - 5 min per workflow update vs manual
3. **User Satisfaction** - 4.5+ star rating on feature
4. **Bug Rate** - <2 bugs per 1000 updates

## Future Enhancements

1. **Team collaboration** - Share workflow progress
2. **Predictive updates** - AI suggests likely completions
3. **Mobile app** - Track time on the go
4. **Integrations** - Sync with Jira, GitHub issues
5. **Voice shortcuts** - "Complete current step"