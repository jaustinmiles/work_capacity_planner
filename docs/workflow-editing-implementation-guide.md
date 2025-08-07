# Workflow Editing Implementation Guide

## Implementation Phases

### Phase 1: Database & Core Models (Days 1-2)

#### 1.1 Update Prisma Schema
```bash
# Add to schema.prisma
model TaskStep {
  # Existing fields...
  
  actualDuration    Int?
  startedAt         DateTime?
  completedAt       DateTime?
  percentComplete   Int         @default(0)
  workSessions      WorkSession[]
}

model WorkSession {
  id                String      @id @default(cuid())
  taskStepId        String
  taskStep          TaskStep    @relation(fields: [taskStepId], references: [id])
  startTime         DateTime
  endTime           DateTime?
  duration          Int
  notes             String?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
}

model TimeEstimateAccuracy {
  id                String      @id @default(cuid())
  sessionId         String
  session           Session     @relation(fields: [sessionId], references: [id])
  taskType          String
  workflowCategory  String?
  estimatedMinutes  Int
  actualMinutes     Int
  variance          Float
  createdAt         DateTime    @default(now())
}

# Run migration
npx prisma migrate dev --name add-workflow-progress-tracking
```

#### 1.2 Update Database Service
```typescript
// src/main/database.ts
// Add new methods:
- createWorkSession()
- updateTaskStepProgress()
- getWorkSessions()
- getTimeAccuracyStats()
- recordTimeEstimate()
```

#### 1.3 Add IPC Handlers
```typescript
// src/main/index.ts
ipcMain.handle('db:createWorkSession', async (_event, data) => {
  return await db.createWorkSession(data);
});

ipcMain.handle('db:updateTaskStepProgress', async (_event, stepId, data) => {
  return await db.updateTaskStepProgress(stepId, data);
});

// Add remaining handlers...
```

### Phase 2: State Management (Days 2-3)

#### 2.1 Update Task Store
```typescript
// src/renderer/store/useTaskStore.ts
interface TaskStore {
  // Add new state
  activeWorkSessions: Map<string, WorkSession>;
  
  // Add new actions
  startWorkOnStep: (stepId: string) => void;
  pauseWorkOnStep: (stepId: string) => void;
  completeStep: (stepId: string, actualMinutes?: number) => void;
  updateStepProgress: (stepId: string, percentComplete: number) => void;
}
```

#### 2.2 Create Progress Tracking Hook
```typescript
// src/renderer/hooks/useWorkflowProgress.ts
export function useWorkflowProgress(workflowId: string) {
  const { sequencedTasks, activeWorkSessions } = useTaskStore();
  
  const workflow = useMemo(
    () => sequencedTasks.find(w => w.id === workflowId),
    [sequencedTasks, workflowId]
  );
  
  const progress = useMemo(
    () => calculateWorkflowProgress(workflow),
    [workflow]
  );
  
  // ... rest of hook implementation
}
```

### Phase 3: UI Components (Days 3-5)

#### 3.1 Create Progress Tracker Component
```typescript
// src/renderer/components/workflow/WorkflowProgressTracker.tsx
export function WorkflowProgressTracker({ workflowId }: Props) {
  const { progress, startWork, completeStep } = useWorkflowProgress(workflowId);
  
  return (
    <Card>
      <ProgressHeader progress={progress} />
      <StepList 
        steps={workflow.steps}
        onStart={startWork}
        onComplete={completeStep}
      />
      <QuickActions workflowId={workflowId} />
    </Card>
  );
}
```

#### 3.2 Create Time Logging Modal
```typescript
// src/renderer/components/workflow/TimeLoggingModal.tsx
export function TimeLoggingModal({ 
  visible, 
  stepId, 
  onClose, 
  onSave 
}: Props) {
  const [form] = Form.useForm();
  
  const handleSave = async () => {
    const values = await form.validateFields();
    await onSave({
      stepId,
      minutes: values.hours * 60 + values.minutes,
      percentComplete: values.percentComplete,
      notes: values.notes
    });
    onClose();
  };
  
  // ... rest of component
}
```

#### 3.3 Integrate into Existing Views
```typescript
// Update src/renderer/components/tasks/SequencedTaskView.tsx
// Add progress tracking UI to workflow display
<WorkflowProgressTracker workflowId={workflow.id} />
```

### Phase 4: Voice Integration (Days 5-7)

#### 4.1 Create Voice Editor Component
```typescript
// src/renderer/components/workflow/VoiceWorkflowEditor.tsx
export function VoiceWorkflowEditor({ workflowId }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [proposedUpdate, setProposedUpdate] = useState<WorkflowUpdate>();
  
  // ... recording logic
  // ... AI processing
  // ... update preview
}
```

#### 4.2 Add AI Processing
```typescript
// src/shared/ai-service.ts
export async function processWorkflowVoiceUpdate(
  transcript: string,
  workflow: SequencedTask,
  context?: JobContext
): Promise<WorkflowUpdate> {
  const prompt = buildWorkflowUpdatePrompt(transcript, workflow, context);
  const response = await callClaude(prompt);
  return parseWorkflowUpdate(response);
}
```

#### 4.3 Create Comparison View
```typescript
// src/renderer/components/workflow/WorkflowComparisonView.tsx
export function WorkflowComparisonView({ 
  original, 
  updated, 
  changes 
}: Props) {
  return (
    <Space>
      <Card title="Before">
        <WorkflowGraph workflow={original} />
      </Card>
      <Card title="After">
        <WorkflowGraph workflow={updated} highlightChanges={changes} />
      </Card>
    </Space>
  );
}
```

### Phase 5: Analytics (Days 7-8)

#### 5.1 Create Analytics Service
```typescript
// src/renderer/services/analytics.ts
export class WorkflowAnalyticsService {
  async getTimeAccuracy(filters?: TimeAccuracyFilters) {
    const data = await db.getTimeAccuracyStats(filters);
    return processAccuracyData(data);
  }
  
  async getWorkflowInsights(workflowId: string) {
    const sessions = await db.getWorkSessions(workflowId);
    return generateInsights(sessions);
  }
}
```

#### 5.2 Create Analytics Components
```typescript
// src/renderer/components/workflow/WorkflowAnalytics.tsx
export function WorkflowAnalytics({ workflowId }: Props) {
  const { accuracy, insights } = useWorkflowAnalytics(workflowId);
  
  return (
    <Space direction="vertical">
      <TimeAccuracyChart data={accuracy} />
      <InsightsList insights={insights} />
      <EstimationTips accuracy={accuracy} />
    </Space>
  );
}
```

### Phase 6: Testing (Days 8-10)

#### 6.1 Write Unit Tests
```bash
# Create test files
touch src/renderer/components/workflow/__tests__/WorkflowProgressTracker.test.tsx
touch src/renderer/services/__tests__/workflow-progress.test.ts
touch src/shared/__tests__/workflow-voice-parser.test.ts
```

#### 6.2 Write Integration Tests
```bash
# Create integration test files
touch src/test/integration/workflow-progress.test.ts
touch src/test/integration/voice-updates.test.ts
```

#### 6.3 Write E2E Tests
```bash
# Create E2E test files
touch e2e/workflow-progress.spec.ts
touch e2e/voice-editing.spec.ts
```

## Development Checklist

### Pre-Development
- [ ] Review and refine requirements
- [ ] Set up feature branch
- [ ] Update TypeScript types
- [ ] Plan component structure

### During Development
- [ ] Follow TDD approach
- [ ] Write tests before implementation
- [ ] Use TypeScript strict mode
- [ ] Add proper error handling
- [ ] Include loading states
- [ ] Add proper logging

### Code Quality
- [ ] Run linter after each component
- [ ] Fix TypeScript errors immediately
- [ ] Add JSDoc comments
- [ ] Keep components focused
- [ ] Extract reusable hooks

### Testing
- [ ] Unit test coverage > 90%
- [ ] Integration tests for flows
- [ ] Manual testing checklist
- [ ] Performance profiling
- [ ] Accessibility audit

### Documentation
- [ ] Update README with feature
- [ ] Add usage examples
- [ ] Document AI prompts
- [ ] Update architecture docs
- [ ] Create user guide

## Common Pitfalls & Solutions

### 1. Race Conditions
**Problem**: Multiple work sessions starting simultaneously
**Solution**: Use database transactions and unique constraints

### 2. Memory Leaks
**Problem**: Timers not cleaned up
**Solution**: Use useEffect cleanup functions

### 3. Large Audio Files
**Problem**: Voice recordings consuming too much memory
**Solution**: Stream audio processing, limit recording duration

### 4. AI Response Variability
**Problem**: Claude returning inconsistent formats
**Solution**: Use Zod schema validation, provide examples in prompt

### 5. Progress Calculation Complexity
**Problem**: Complex workflows with dependencies
**Solution**: Cache calculations, use memoization

## Performance Optimization

### 1. Debounce Updates
```typescript
const debouncedProgress = useMemo(
  () => debounce(updateProgress, 500),
  []
);
```

### 2. Virtualize Long Lists
```typescript
import { VirtualList } from '@tanstack/react-virtual';

// Use for workflows with many steps
```

### 3. Lazy Load Analytics
```typescript
const Analytics = lazy(() => import('./WorkflowAnalytics'));
```

### 4. Optimize Re-renders
```typescript
const StepItem = memo(({ step, onUpdate }) => {
  // Component implementation
}, (prevProps, nextProps) => {
  return prevProps.step.percentComplete === nextProps.step.percentComplete;
});
```

## Deployment Considerations

### 1. Database Migrations
- Test migration on copy of production data
- Have rollback plan ready
- Run during low-usage period

### 2. Feature Flags
```typescript
const FEATURES = {
  VOICE_WORKFLOW_EDITING: process.env.ENABLE_VOICE_EDITING === 'true',
  TIME_ANALYTICS: process.env.ENABLE_ANALYTICS === 'true',
};
```

### 3. Gradual Rollout
- Deploy to internal users first
- Monitor error rates
- Gather feedback
- Fix issues before wide release

### 4. Monitoring
```typescript
// Add telemetry
trackEvent('workflow_progress_started', { workflowId });
trackEvent('voice_update_completed', { changes: update.length });
trackError('workflow_update_failed', error);
```

## Success Criteria

### Technical
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Performance benchmarks met
- [ ] Accessibility standards met

### User Experience
- [ ] Time tracking feels natural
- [ ] Voice updates work reliably
- [ ] Progress visualization is clear
- [ ] Analytics provide value

### Business
- [ ] Estimation accuracy improves
- [ ] User engagement increases
- [ ] Feature adoption > 50%
- [ ] Positive user feedback