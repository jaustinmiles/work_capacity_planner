# Workflow Editing Technical Design

## Component Architecture

### 1. New Components Structure
```
src/renderer/components/
├── workflow/
│   ├── WorkflowProgressTracker.tsx    // Main progress UI
│   ├── StepProgressItem.tsx           // Individual step progress
│   ├── TimeLoggingModal.tsx          // Log actual time spent
│   ├── WorkflowComparisonView.tsx    // Before/after diff
│   ├── VoiceWorkflowEditor.tsx       // Voice command interface
│   └── WorkflowAnalytics.tsx         // Time accuracy insights
```

### 2. Updated Store Structure
```typescript
// src/renderer/store/useTaskStore.ts
interface TaskStore {
  // Existing...
  
  // New workflow tracking
  activeWorkSessions: Map<string, WorkSession>;
  
  // New actions
  startWorkOnStep: (stepId: string) => void;
  pauseWorkOnStep: (stepId: string) => void;
  completeStep: (stepId: string, actualMinutes?: number, notes?: string) => void;
  updateStepProgress: (stepId: string, percentComplete: number) => void;
  logWorkSession: (stepId: string, minutes: number, notes?: string) => void;
  
  // Voice editing
  processVoiceUpdate: (transcript: string, workflowId: string) => Promise<WorkflowUpdate>;
  applyWorkflowUpdate: (update: WorkflowUpdate) => void;
  
  // Analytics
  getTimeAccuracy: (taskType?: string) => TimeAccuracyStats;
  getWorkflowCompletion: (workflowId: string) => WorkflowCompletionStats;
}
```

### 3. Database Service Extensions
```typescript
// src/main/database.ts
class DatabaseService {
  // Work session tracking
  async createWorkSession(data: {
    taskStepId: string;
    startTime: Date;
    duration: number;
    notes?: string;
  }): Promise<WorkSession>;
  
  async updateTaskStepProgress(stepId: string, data: {
    actualDuration?: number;
    percentComplete?: number;
    status?: StepStatus;
    completedAt?: Date;
  }): Promise<TaskStep>;
  
  // Analytics
  async getTimeAccuracyStats(sessionId: string, filters?: {
    taskType?: string;
    dateRange?: { start: Date; end: Date };
  }): Promise<TimeAccuracyStats>;
  
  async recordTimeEstimate(data: {
    taskType: string;
    estimatedMinutes: number;
    actualMinutes: number;
  }): Promise<void>;
}
```

## UI/UX Specifications

### 1. WorkflowProgressTracker Layout
```tsx
<Card>
  <Space direction="vertical" style={{ width: '100%' }}>
    {/* Overall Progress */}
    <div>
      <Text>Deployment Workflow</Text>
      <Progress percent={45} status="active" />
      <Space>
        <Tag>3/7 steps complete</Tag>
        <Tag>12.5h / 28h total</Tag>
        <Tag color="orange">Running 2h longer than estimated</Tag>
      </Space>
    </div>
    
    {/* Step List */}
    <List>
      {steps.map(step => (
        <StepProgressItem 
          key={step.id}
          step={step}
          onStart={() => startWork(step.id)}
          onComplete={() => showTimeLogging(step.id)}
          onUpdateProgress={() => showProgressModal(step.id)}
        />
      ))}
    </List>
    
    {/* Quick Actions */}
    <Space>
      <Button icon={<IconMicrophone />} onClick={openVoiceEditor}>
        Update with Voice
      </Button>
      <Button onClick={showAnalytics}>View Time Analytics</Button>
    </Space>
  </Space>
</Card>
```

### 2. Voice Workflow Editor Flow
```
1. User clicks "Update with Voice"
2. Modal opens with recording interface
3. User speaks updates naturally
4. System shows transcription in real-time
5. On stop, AI processes and shows proposed changes
6. User sees before/after comparison
7. User can accept all, modify, or reject changes
```

### 3. Time Logging Modal
```tsx
<Modal title="Log Time for: Code Review">
  <Form>
    <Form.Item label="Time Spent">
      <Space>
        <InputNumber placeholder="Hours" min={0} max={24} />
        <InputNumber placeholder="Minutes" min={0} max={59} />
      </Space>
    </Form.Item>
    
    <Form.Item label="Quick Select">
      <Radio.Group>
        <Radio.Button value={30}>30m</Radio.Button>
        <Radio.Button value={60}>1h</Radio.Button>
        <Radio.Button value={120}>2h</Radio.Button>
        <Radio.Button value={240}>4h</Radio.Button>
      </Radio.Group>
    </Form.Item>
    
    <Form.Item label="Completion Status">
      <Slider 
        marks={{ 0: '0%', 50: '50%', 100: '100%' }}
        defaultValue={100}
      />
    </Form.Item>
    
    <Form.Item label="Notes (optional)">
      <TextArea rows={3} placeholder="Any blockers or comments..." />
    </Form.Item>
  </Form>
</Modal>
```

## State Management Details

### 1. Work Session Tracking
```typescript
interface WorkSession {
  stepId: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // accumulated minutes
  isPaused: boolean;
  notes: string[];
}

// Track active sessions in memory
const activeWorkSessions = new Map<string, WorkSession>();

// Persist completed sessions to database
const completeWorkSession = async (stepId: string) => {
  const session = activeWorkSessions.get(stepId);
  if (session) {
    await db.createWorkSession({
      taskStepId: stepId,
      startTime: session.startTime,
      duration: session.duration,
      notes: session.notes.join('\n')
    });
    activeWorkSessions.delete(stepId);
  }
};
```

### 2. Progress Calculation
```typescript
const calculateWorkflowProgress = (workflow: SequencedTask): WorkflowProgress => {
  const steps = workflow.steps;
  const totalSteps = steps.length;
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const inProgressSteps = steps.filter(s => s.status === 'in_progress');
  
  // Time calculations
  const totalEstimatedMinutes = steps.reduce((sum, s) => sum + s.duration, 0);
  const totalActualMinutes = steps.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
  const completedMinutes = steps
    .filter(s => s.status === 'completed')
    .reduce((sum, s) => sum + (s.actualDuration || s.duration), 0);
  
  // Weighted progress (by time)
  const timeProgress = (completedMinutes / totalEstimatedMinutes) * 100;
  
  // Step progress  
  const stepProgress = (completedSteps / totalSteps) * 100;
  
  return {
    stepProgress,
    timeProgress,
    completedSteps,
    totalSteps,
    totalEstimatedMinutes,
    totalActualMinutes,
    variance: totalActualMinutes - totalEstimatedMinutes,
    remainingMinutes: totalEstimatedMinutes - completedMinutes,
    status: determineWorkflowStatus(workflow)
  };
};
```

## AI Integration Specifications

### 1. Voice Update Processing
```typescript
const processVoiceWorkflowUpdate = async (
  transcript: string, 
  workflow: SequencedTask
): Promise<WorkflowUpdate> => {
  const prompt = `
Current workflow state:
${JSON.stringify(workflow, null, 2)}

User voice update:
"${transcript}"

Extract and structure the updates the user wants to make.
Consider:
- Which steps are being marked complete
- Time updates (actual vs estimated)
- New steps to add
- Progress updates (partial completion)
- Any reordering or dependency changes

Return a structured update object.
`;

  const response = await ai.processWorkflowUpdate(prompt);
  return validateWorkflowUpdate(response);
};
```

### 2. Change Validation
```typescript
const validateWorkflowUpdate = (update: any): WorkflowUpdate => {
  // Validate step IDs exist
  update.completedSteps?.forEach(cs => {
    if (!workflow.steps.find(s => s.id === cs.stepId)) {
      throw new Error(`Invalid step ID: ${cs.stepId}`);
    }
  });
  
  // Validate duration updates are reasonable
  update.durationUpdates?.forEach(du => {
    if (du.newDuration < 0 || du.newDuration > 480) { // Max 8 hours
      throw new Error(`Invalid duration: ${du.newDuration}`);
    }
  });
  
  // Validate dependencies don't create cycles
  if (update.dependencyChanges) {
    validateNoCycles(workflow, update.dependencyChanges);
  }
  
  return update as WorkflowUpdate;
};
```

## Testing Implementation

### 1. Component Tests
```typescript
// WorkflowProgressTracker.test.tsx
describe('WorkflowProgressTracker', () => {
  const mockWorkflow = createMockWorkflow({
    steps: [
      { id: '1', duration: 60, status: 'completed', actualDuration: 75 },
      { id: '2', duration: 120, status: 'in_progress', percentComplete: 50 },
      { id: '3', duration: 90, status: 'pending' }
    ]
  });
  
  it('shows correct overall progress', () => {
    render(<WorkflowProgressTracker workflow={mockWorkflow} />);
    expect(screen.getByText('1/3 steps complete')).toBeInTheDocument();
    expect(screen.getByText('33% complete')).toBeInTheDocument();
  });
  
  it('calculates time variance correctly', () => {
    render(<WorkflowProgressTracker workflow={mockWorkflow} />);
    expect(screen.getByText('Running 15m longer than estimated')).toBeInTheDocument();
  });
});
```

### 2. Integration Tests
```typescript
// voice-workflow-update.integration.test.ts
describe('Voice Workflow Update Integration', () => {
  it('processes natural language completion', async () => {
    const transcript = "I finished the first two steps of the deployment workflow";
    const workflow = createMockWorkflow({ steps: 3 });
    
    const update = await processVoiceUpdate(transcript, workflow);
    
    expect(update.completedSteps).toHaveLength(2);
    expect(update.completedSteps[0].stepId).toBe(workflow.steps[0].id);
    expect(update.completedSteps[1].stepId).toBe(workflow.steps[1].id);
  });
  
  it('handles time updates in natural language', async () => {
    const transcript = "The code review took 3 hours instead of 1";
    const workflow = createMockWorkflow({ 
      steps: [{ name: 'Code Review', duration: 60 }] 
    });
    
    const update = await processVoiceUpdate(transcript, workflow);
    
    expect(update.durationUpdates).toHaveLength(1);
    expect(update.durationUpdates[0].newDuration).toBe(180);
  });
});
```

## Performance Optimizations

### 1. Debounced Progress Updates
```typescript
const debouncedUpdateProgress = useMemo(
  () => debounce((stepId: string, progress: number) => {
    updateStepProgress(stepId, progress);
  }, 500),
  []
);
```

### 2. Memoized Calculations
```typescript
const workflowProgress = useMemo(
  () => calculateWorkflowProgress(workflow),
  [workflow.steps]
);

const timeAccuracy = useMemo(
  () => calculateTimeAccuracy(workflow),
  [workflow.steps]
);
```

### 3. Lazy Analytics Loading
```typescript
const WorkflowAnalytics = lazy(() => import('./WorkflowAnalytics'));

// In component
{showAnalytics && (
  <Suspense fallback={<Spin />}>
    <WorkflowAnalytics workflowId={workflow.id} />
  </Suspense>
)}
```

## Error Handling

### 1. Voice Recording Errors
```typescript
const handleVoiceError = (error: Error) => {
  if (error.name === 'NotAllowedError') {
    Message.error('Microphone access denied. Please check permissions.');
  } else if (error.name === 'NotFoundError') {
    Message.error('No microphone found. Please connect a microphone.');
  } else {
    Message.error('Voice recording failed. Please try again.');
    console.error('Voice recording error:', error);
  }
};
```

### 2. Update Validation Errors
```typescript
const applyWorkflowUpdate = async (update: WorkflowUpdate) => {
  try {
    // Validate update
    const validation = validateUpdate(update);
    if (!validation.isValid) {
      Message.error(validation.error);
      return;
    }
    
    // Apply update optimistically
    setOptimisticUpdate(update);
    
    // Persist to database
    await db.applyWorkflowUpdate(update);
    
    Message.success('Workflow updated successfully');
  } catch (error) {
    // Rollback optimistic update
    rollbackOptimisticUpdate();
    Message.error('Failed to update workflow. Please try again.');
    console.error('Workflow update error:', error);
  }
};
```

## Migration Strategy

### 1. Database Migration
```sql
-- Add progress tracking fields to TaskStep
ALTER TABLE TaskStep 
ADD COLUMN actualDuration INTEGER,
ADD COLUMN startedAt DATETIME,
ADD COLUMN completedAt DATETIME,
ADD COLUMN percentComplete INTEGER DEFAULT 0;

-- Create WorkSession table
CREATE TABLE WorkSession (
  id TEXT PRIMARY KEY,
  taskStepId TEXT NOT NULL,
  startTime DATETIME NOT NULL,
  endTime DATETIME,
  duration INTEGER NOT NULL,
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (taskStepId) REFERENCES TaskStep(id)
);

-- Create TimeEstimateAccuracy table
CREATE TABLE TimeEstimateAccuracy (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  taskType TEXT NOT NULL,
  workflowCategory TEXT,
  estimatedMinutes INTEGER NOT NULL,
  actualMinutes INTEGER NOT NULL,
  variance REAL NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sessionId) REFERENCES Session(id)
);
```

### 2. Backward Compatibility
- Existing workflows continue to work without progress tracking
- UI gracefully handles missing actualDuration fields
- Analytics only include data from after migration

## Monitoring & Analytics

### 1. Feature Usage Metrics
```typescript
// Track feature adoption
trackEvent('workflow_progress_viewed', { workflowId });
trackEvent('voice_update_started', { workflowId });
trackEvent('voice_update_completed', { success: true, changesCount: 3 });
trackEvent('time_logged', { minutes: 120, method: 'manual' });
```

### 2. Performance Metrics
```typescript
// Monitor AI processing time
const startTime = performance.now();
const update = await processVoiceUpdate(transcript);
const processingTime = performance.now() - startTime;

trackMetric('voice_processing_time', processingTime);
```

### 3. Error Tracking
```typescript
// Sentry integration for production
Sentry.captureException(error, {
  tags: {
    feature: 'workflow_editing',
    action: 'voice_update'
  },
  extra: {
    transcript,
    workflowId
  }
});
```