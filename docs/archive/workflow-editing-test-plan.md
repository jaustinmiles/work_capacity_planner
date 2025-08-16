# Workflow Editing Feature Test Plan

## Test Strategy Overview

This test plan ensures comprehensive coverage of the workflow progress tracking and voice editing features, emphasizing reliability, accuracy, and user experience.

## Testing Pyramid

```
         E2E Tests (10%)
        /           \
    Integration (30%)
   /               \
Unit Tests (60%)
```

## 1. Unit Tests

### Component Tests

#### WorkflowProgressTracker
```typescript
describe('WorkflowProgressTracker', () => {
  describe('Progress Calculations', () => {
    it('calculates step-based progress correctly');
    it('calculates time-based progress correctly');
    it('handles partially completed steps');
    it('accounts for actual vs estimated time');
    it('shows correct remaining time');
  });
  
  describe('Status Determination', () => {
    it('shows "on track" when within threshold');
    it('shows "delayed" when over time');
    it('shows "completed" when all steps done');
    it('updates parent workflow status');
  });
  
  describe('User Interactions', () => {
    it('starts work session on button click');
    it('opens time logging modal on complete');
    it('updates progress bar in real-time');
    it('handles pause/resume correctly');
  });
});
```

#### TimeLoggingModal
```typescript
describe('TimeLoggingModal', () => {
  describe('Time Input', () => {
    it('accepts manual time entry');
    it('validates time ranges (0-24h)');
    it('converts hours/minutes correctly');
    it('handles quick select buttons');
  });
  
  describe('Progress Tracking', () => {
    it('updates completion percentage');
    it('allows partial completion');
    it('validates percentage (0-100)');
    it('saves notes with session');
  });
  
  describe('Form Submission', () => {
    it('creates work session record');
    it('updates step progress');
    it('closes modal on success');
    it('shows error on failure');
  });
});
```

#### VoiceWorkflowEditor
```typescript
describe('VoiceWorkflowEditor', () => {
  describe('Recording', () => {
    it('requests microphone permission');
    it('shows recording indicator');
    it('handles recording errors gracefully');
    it('limits recording duration');
  });
  
  describe('Transcription', () => {
    it('displays transcript in real-time');
    it('allows transcript editing');
    it('shows processing state');
    it('handles transcription errors');
  });
  
  describe('AI Processing', () => {
    it('sends correct prompt to AI');
    it('validates AI response format');
    it('shows proposed changes clearly');
    it('handles AI errors gracefully');
  });
});
```

### Service Tests

#### WorkflowProgressService
```typescript
describe('WorkflowProgressService', () => {
  describe('calculateWorkflowProgress', () => {
    it('returns correct completion percentage');
    it('calculates time variance accurately');
    it('determines workflow status correctly');
    it('handles empty workflows');
    it('handles workflows with no estimates');
  });
  
  describe('startWorkSession', () => {
    it('creates new session with correct data');
    it('prevents duplicate active sessions');
    it('updates step status to in_progress');
    it('handles database errors');
  });
  
  describe('completeStep', () => {
    it('ends active work session');
    it('records actual duration');
    it('updates step status');
    it('calculates time accuracy');
    it('triggers analytics recording');
  });
});
```

#### TimeAccuracyService
```typescript
describe('TimeAccuracyService', () => {
  describe('calculateAccuracy', () => {
    it('calculates variance percentage correctly');
    it('categorizes accuracy levels');
    it('aggregates by task type');
    it('detects estimation trends');
  });
  
  describe('getInsights', () => {
    it('identifies consistent over-estimation');
    it('identifies consistent under-estimation');
    it('suggests estimation improvements');
    it('handles insufficient data gracefully');
  });
});
```

### Utility Tests

#### Voice Command Parser
```typescript
describe('parseVoiceCommand', () => {
  it('extracts completion commands');
  it('extracts time updates');
  it('extracts progress updates');
  it('handles ambiguous commands');
  it('returns structured updates');
});
```

#### Validation Functions
```typescript
describe('Validation', () => {
  describe('validateWorkflowUpdate', () => {
    it('validates step IDs exist');
    it('validates duration ranges');
    it('validates percentage ranges');
    it('checks for dependency cycles');
    it('returns detailed error messages');
  });
  
  describe('validateTimeEntry', () => {
    it('validates positive durations');
    it('validates reasonable maximums');
    it('handles edge cases (0, MAX)');
  });
});
```

## 2. Integration Tests

### Database Integration
```typescript
describe('Database Integration', () => {
  describe('Work Session Persistence', () => {
    it('saves work sessions correctly');
    it('links sessions to steps');
    it('calculates session duration');
    it('handles concurrent sessions');
  });
  
  describe('Progress Updates', () => {
    it('updates step progress atomically');
    it('maintains data consistency');
    it('handles transaction rollbacks');
    it('updates timestamps correctly');
  });
  
  describe('Analytics Aggregation', () => {
    it('aggregates time accuracy data');
    it('calculates trends over time');
    it('filters by date range');
    it('groups by task type');
  });
});
```

### AI Integration
```typescript
describe('AI Workflow Updates', () => {
  describe('Voice Processing Pipeline', () => {
    it('transcribes audio correctly');
    it('processes natural language commands');
    it('generates valid update objects');
    it('handles multiple updates in one command');
  });
  
  describe('Update Application', () => {
    it('applies completion updates');
    it('applies duration changes');
    it('applies progress updates');
    it('validates before applying');
    it('rolls back on error');
  });
  
  describe('Error Scenarios', () => {
    it('handles AI service timeout');
    it('handles invalid AI responses');
    it('provides user-friendly errors');
    it('falls back gracefully');
  });
});
```

### Store Integration
```typescript
describe('Store Integration', () => {
  describe('State Updates', () => {
    it('updates UI optimistically');
    it('syncs with database');
    it('handles conflicts');
    it('maintains consistency');
  });
  
  describe('Real-time Progress', () => {
    it('tracks active sessions');
    it('updates timers live');
    it('persists on unmount');
    it('resumes on remount');
  });
});
```

## 3. E2E Tests

### Complete Workflows
```typescript
describe('E2E: Workflow Progress Tracking', () => {
  it('completes a full workflow with time tracking', async () => {
    // 1. Navigate to workflow
    await page.goto('/workflows/deployment');
    
    // 2. Start first step
    await page.click('[data-testid="start-step-1"]');
    await expect(page.locator('.step-status')).toHaveText('In Progress');
    
    // 3. Complete with time
    await page.click('[data-testid="complete-step-1"]');
    await page.fill('[data-testid="time-hours"]', '2');
    await page.fill('[data-testid="time-minutes"]', '30');
    await page.click('[data-testid="save-time"]');
    
    // 4. Verify progress update
    await expect(page.locator('.workflow-progress')).toHaveText('14% complete');
    
    // 5. Continue through workflow
    // ...
  });
  
  it('updates workflow via voice commands', async () => {
    // 1. Open voice editor
    await page.click('[data-testid="voice-update"]');
    
    // 2. Grant microphone permission
    await context.grantPermissions(['microphone']);
    
    // 3. Simulate voice input
    await page.evaluate(() => {
      window.mockTranscript = "I completed the first two steps";
    });
    
    // 4. Process update
    await page.click('[data-testid="process-voice"]');
    
    // 5. Review changes
    await expect(page.locator('.proposed-changes')).toContainText('2 steps completed');
    
    // 6. Apply changes
    await page.click('[data-testid="apply-changes"]');
    
    // 7. Verify updates
    await expect(page.locator('.completed-steps')).toHaveCount(2);
  });
});
```

### Error Scenarios
```typescript
describe('E2E: Error Handling', () => {
  it('handles microphone permission denial gracefully');
  it('handles network errors during AI processing');
  it('handles invalid voice commands appropriately');
  it('recovers from database connection issues');
});
```

## 4. Performance Tests

### Load Testing
```typescript
describe('Performance', () => {
  it('handles workflows with 100+ steps efficiently');
  it('updates progress without UI lag');
  it('processes voice commands within 3 seconds');
  it('loads analytics data quickly (<500ms)');
});
```

### Memory Testing
```typescript
describe('Memory Management', () => {
  it('cleans up work session timers');
  it('releases audio recording resources');
  it('prevents memory leaks in progress tracking');
  it('handles long-running sessions');
});
```

## 5. Accessibility Tests

```typescript
describe('Accessibility', () => {
  it('provides keyboard navigation for all features');
  it('announces progress updates to screen readers');
  it('has proper ARIA labels for controls');
  it('maintains focus management in modals');
  it('provides text alternatives for progress visuals');
});
```

## 6. Browser Compatibility

### Electron Webview
- Test all features in Electron environment
- Verify IPC communication
- Test file system operations

### Voice Recording
- Test microphone access in Electron
- Verify audio format compatibility
- Test error handling for missing devices

## Test Data Fixtures

### Mock Workflows
```typescript
export const mockWorkflows = {
  simple: createWorkflow({
    name: 'Simple Deploy',
    steps: [
      { name: 'Build', duration: 30 },
      { name: 'Test', duration: 60 },
      { name: 'Deploy', duration: 30 }
    ]
  }),
  
  complex: createWorkflow({
    name: 'Complex Feature',
    steps: [
      { name: 'Design', duration: 240 },
      { name: 'Implement', duration: 480, dependsOn: ['Design'] },
      { name: 'Test', duration: 180, dependsOn: ['Implement'] },
      { name: 'Review', duration: 120, asyncWaitTime: 1440 },
      { name: 'Deploy', duration: 60, dependsOn: ['Review'] }
    ]
  }),
  
  inProgress: createWorkflow({
    name: 'In Progress',
    steps: [
      { name: 'Step 1', duration: 60, status: 'completed', actualDuration: 75 },
      { name: 'Step 2', duration: 120, status: 'in_progress', percentComplete: 50 },
      { name: 'Step 3', duration: 90, status: 'pending' }
    ]
  })
};
```

### Voice Command Examples
```typescript
export const voiceCommands = {
  completion: [
    "I finished the first step",
    "Mark the deployment step as complete",
    "I'm done with testing"
  ],
  
  timeUpdate: [
    "The code review took 3 hours",
    "Implementation was faster, only 2 hours",
    "Add 30 minutes to the current step"
  ],
  
  progress: [
    "I'm halfway through implementation",
    "Testing is 75% complete",
    "Almost done with the design phase"
  ],
  
  complex: [
    "I finished the first two steps, the third one will take longer, maybe 4 hours instead of 2"
  ]
};
```

## Continuous Integration

### Test Execution Order
1. Lint checks
2. Type checks  
3. Unit tests
4. Integration tests
5. E2E tests (on PR only)

### Coverage Requirements
- Overall: 80%
- New code: 90%
- Critical paths: 95%

### Performance Budgets
- Unit tests: < 5 seconds
- Integration tests: < 30 seconds
- E2E tests: < 2 minutes

## Manual Testing Checklist

### Happy Path
- [ ] Start and complete a simple workflow
- [ ] Log time for multiple steps
- [ ] Use voice to update progress
- [ ] View time accuracy analytics
- [ ] Export workflow report

### Edge Cases
- [ ] Pause and resume work sessions
- [ ] Handle app restart during active session
- [ ] Complete steps out of order
- [ ] Update completed workflows
- [ ] Handle very long workflows (50+ steps)

### Error Scenarios
- [ ] Deny microphone permission
- [ ] Disconnect during voice recording
- [ ] Enter invalid time values
- [ ] Speak ambiguous commands
- [ ] Work offline

### Performance
- [ ] Work with 100+ workflows
- [ ] Track time for 8+ hours
- [ ] Process 5-minute voice recordings
- [ ] Load analytics for 6 months of data

## Regression Tests

### Existing Features
- [ ] Basic task creation still works
- [ ] Workflow scheduling unaffected
- [ ] Calendar view shows progress
- [ ] Export functionality intact
- [ ] Settings persistence works

## Security Tests

### Input Validation
- [ ] XSS in notes fields
- [ ] SQL injection attempts
- [ ] Large time values
- [ ] Negative numbers
- [ ] Unicode in voice commands

### Permission Tests
- [ ] Microphone access handling
- [ ] File system restrictions
- [ ] API key protection
- [ ] Session isolation