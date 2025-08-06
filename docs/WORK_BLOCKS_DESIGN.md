# Flexible Work Blocks Design

## Problem Statement

Current limitations:
- Only supports single start/end time per day
- Cannot track accumulated work time during the day
- No way to add ad-hoc meetings or blocks
- Cannot model flexible work patterns (multiple blocks per day)
- No real-time capacity tracking

## Proposed Solution

### 1. Work Block Model

Replace current `WorkHours` with flexible blocks:

```typescript
interface WorkBlock {
  id: string
  dayOfWeek: number // 0-6
  startTime: string // "09:00"
  endTime: string // "12:00"
  type: 'focused' | 'admin' | 'mixed'
  capacity?: {
    focusMinutes?: number
    adminMinutes?: number
  }
}

interface DailyWorkPattern {
  date: string // "2025-08-07"
  blocks: WorkBlock[]
  accumulated: {
    focusMinutes: number
    adminMinutes: number
  }
  meetings: Meeting[]
}

interface Meeting {
  id: string
  name: string
  startTime: Date
  endTime: Date
  type: 'meeting' | 'break' | 'personal'
}
```

### 2. Real-Time Tracking

Track work as it happens:

```typescript
interface WorkSession {
  id: string
  taskId: string
  startTime: Date
  endTime?: Date
  type: 'focused' | 'admin'
  actualDuration?: number
  notes?: string
}
```

### 3. Dynamic Scheduling

The scheduler needs updates to:
1. Consider multiple work blocks per day
2. Respect accumulated time already spent
3. Schedule around meetings dynamically
4. Allow "what-if" scenarios with different blocks

### 4. UI Components

#### Work Day Editor
- Visual timeline for the day (6am - 10pm)
- Drag to create work blocks
- Click to add meetings
- Show accumulated time vs capacity
- Quick templates (morning person, night owl, split day)

#### Current Status Widget
- Today's accumulated time
- Remaining capacity
- Next available work block
- Current task progress

#### Block Optimizer
- Suggest optimal blocks for high-priority items
- Show impact of different block arrangements
- Recommend break times based on workload

### 5. Implementation Plan

#### Phase 1: Data Model
1. Update database schema
2. Create migration for existing data
3. Update types and interfaces

#### Phase 2: Tracking
1. Add work session tracking
2. Create timer component
3. Update capacity in real-time

#### Phase 3: Flexible Blocks
1. Update work settings UI
2. Create block editor component
3. Modify scheduler algorithm

#### Phase 4: Intelligence
1. Add block optimization
2. Create what-if scenarios
3. Build analytics dashboard

## User Scenarios

### Scenario 1: Morning Meeting
- User has worked 7-9am (2h focus)
- Meeting added 10-11am
- App suggests work blocks 11am-1pm, 2-5pm
- Shows updated ETAs for all tasks

### Scenario 2: Async Wait Optimization
- User starts deployment at 4pm (30min async wait)
- App suggests quick admin tasks or break
- Returns to focused work after deployment

### Scenario 3: Energy-Based Scheduling
- User marks high-energy times (9-11am, 2-4pm)
- App schedules complex tasks during these blocks
- Admin tasks fill low-energy periods

## Technical Considerations

### Performance
- Cache block calculations
- Incremental schedule updates
- Virtualize timeline rendering

### Storage
- Store patterns as templates
- Track historical patterns
- Sync across devices (future)

### Integration
- Calendar sync for meetings
- Time tracking app integration
- Slack status updates

## Migration Path

1. Keep current simple model working
2. Add new models alongside
3. Provide migration wizard
4. Gradually deprecate old model

## Success Metrics

- Accuracy of time estimates
- Reduction in context switching
- Completion rate improvement
- User satisfaction with flexibility