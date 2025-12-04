import type {
  DailyWorkPattern,
  WorkBlock,
  NextScheduledItem,
  ActiveWorkSession,
  Meeting,
  WorkSettings,
  TimeLogEntry,
  WorkSession,
} from '@/shared/types'
import { BlockTypeConfig } from '@/shared/user-task-types'
import { WorkBlockType, BlockConfigKind } from '@/shared/enums'
import { calculateBlockCapacity } from '@/shared/capacity-calculator'

/**
 * Helper to create typeConfig from a type string (for backwards compat in tests)
 */
function createTypeConfig(type: string): BlockTypeConfig {
  switch (type) {
    case 'focused':
    case 'admin':
    case 'personal':
      return { kind: BlockConfigKind.Single, typeId: type }
    case 'combo':
    case 'mixed':
      return {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'focused', ratio: 0.5 },
          { typeId: 'admin', ratio: 0.5 },
        ],
      }
    case 'sleep':
      return { kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep }
    case 'blocked':
    case 'break':
    case 'meeting':
    default:
      return { kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked }
  }
}

/**
 * Creates a mock DailyWorkPattern with realistic data
 */
export function createMockWorkPattern(overrides?: Partial<DailyWorkPattern>): DailyWorkPattern {
  const defaultPattern: DailyWorkPattern = {
    id: 'pattern-1',
    date: new Date().toISOString().split('T')[0], // Today's date
    dayOfWeek: new Date().getDay(),
    blocks: [
      createMockWorkBlock({ id: 'block-1', typeConfig: { kind: BlockConfigKind.Single, typeId: 'focused' }, startTime: '09:00', endTime: '11:00' }),
      createMockWorkBlock({ id: 'block-2', typeConfig: { kind: BlockConfigKind.Single, typeId: 'admin' }, startTime: '11:00', endTime: '12:00' }),
      createMockWorkBlock({ id: 'block-3', typeConfig: { kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked }, startTime: '12:00', endTime: '13:00' }),
      createMockWorkBlock({ id: 'block-4', typeConfig: { kind: BlockConfigKind.Combo, allocations: [{ typeId: 'focused', ratio: 0.5 }, { typeId: 'admin', ratio: 0.5 }] }, startTime: '13:00', endTime: '15:00' }),
      createMockWorkBlock({ id: 'block-5', typeConfig: { kind: BlockConfigKind.Single, typeId: 'personal' }, startTime: '15:00', endTime: '17:00' }),
    ],
    totalCapacity: 420, // 7 hours in minutes
    totalAccumulated: 0,
    meetings: [],
    ...overrides,
  }

  // Recalculate totalCapacity if blocks were overridden
  if (!overrides?.totalCapacity) {
    defaultPattern.totalCapacity = defaultPattern.blocks.reduce((sum, block) => {
      if (block.capacity && block.typeConfig.kind !== BlockConfigKind.System) {
        return sum + block.capacity.totalMinutes
      }
      return sum
    }, 0)
  }

  return defaultPattern
}

/**
 * Creates a mock WorkBlock with typeConfig
 */
export function createMockWorkBlock(overrides?: Partial<WorkBlock> & { type?: string }): WorkBlock {
  // Handle legacy 'type' property by converting to typeConfig
  let typeConfig: BlockTypeConfig = overrides?.typeConfig || { kind: 'single', typeId: 'focused' }
  if (overrides?.type && !overrides?.typeConfig) {
    typeConfig = createTypeConfig(overrides.type)
  }

  const startTime = overrides?.startTime || '09:00'
  const endTime = overrides?.endTime || '10:00'

  const defaultBlock: WorkBlock = {
    id: overrides?.id || 'block-1',
    startTime,
    endTime,
    typeConfig,
    capacity: overrides?.capacity || calculateBlockCapacity(typeConfig, startTime, endTime),
  }

  return defaultBlock
}

/**
 * Creates a mock NextScheduledItem
 */
export function createMockNextScheduledItem(overrides?: Partial<NextScheduledItem>): NextScheduledItem {
  const defaultItem: NextScheduledItem = {
    id: 'next-1',
    title: 'Next Task',
    type: 'task',  // 'task' | 'step'
    taskType: 'focused',  // TaskType
    isStep: false,
    parentId: null,
    estimatedDuration: 30,
    scheduledStartTime: new Date(Date.now() + 5 * 60000), // 5 minutes from now
    ...overrides,
  }

  return defaultItem
}

/**
 * Creates a mock ActiveWorkSession
 */
export function createMockActiveWorkSession(overrides?: Partial<ActiveWorkSession>): ActiveWorkSession {
  const defaultSession: ActiveWorkSession = {
    id: 'session-1',
    taskId: 'task-1',
    taskTitle: 'Active Task',
    startTime: new Date(Date.now() - 15 * 60000), // Started 15 minutes ago
    pausedAt: null,
    totalPausedTime: 0,
    isStep: false,
    stepId: null,
    ...overrides,
  }

  return defaultSession
}

/**
 * Creates a mock Meeting
 */
export function createMockMeeting(overrides?: Partial<Meeting>): Meeting {
  const defaultMeeting: Meeting = {
    title: 'Team Standup',
    startTime: '10:00',
    endTime: '10:30',
    duration: 30,
    ...overrides,
  }

  // Calculate duration if not provided
  if (!overrides?.duration) {
    const [startHour, startMin] = defaultMeeting.startTime.split(':').map(Number)
    const [endHour, endMin] = defaultMeeting.endTime.split(':').map(Number)
    defaultMeeting.duration = (endHour * 60 + endMin) - (startHour * 60 + startMin)
  }

  return defaultMeeting
}

/**
 * Creates a mock WorkSettings
 */
export function createMockWorkSettings(overrides?: Partial<WorkSettings>): WorkSettings {
  const defaultSettings: WorkSettings = {
    workBlocksEnabled: true,
    strictOrderingEnabled: false,
    dailyWorkHours: 8,
    weeklyWorkDays: 5,
    workStartTime: '09:00',
    workEndTime: '17:00',
    breakDuration: 60,
    focusSessionDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    ...overrides,
  }

  return defaultSettings
}

/**
 * Creates a mock TimeLogEntry
 */
export function createMockTimeLogEntry(overrides?: Partial<TimeLogEntry>): TimeLogEntry {
  const defaultEntry: TimeLogEntry = {
    id: 'log-1',
    taskId: 'task-1',
    duration: 30,
    loggedAt: new Date(),
    description: 'Worked on task',
    isStep: false,
    stepId: null,
    ...overrides,
  }

  return defaultEntry
}

/**
 * Creates a mock WorkSession
 */
export function createMockWorkSession(overrides?: Partial<WorkSession>): WorkSession {
  const defaultSession: WorkSession = {
    id: 'work-session-1',
    taskId: 'task-1',
    startTime: new Date(Date.now() - 60 * 60000), // 1 hour ago
    endTime: new Date(Date.now() - 30 * 60000), // 30 minutes ago
    duration: 30,
    pausedDuration: 0,
    completed: true,
    notes: '',
    isStep: false,
    stepId: null,
    createdAt: new Date(Date.now() - 60 * 60000),
    updatedAt: new Date(Date.now() - 30 * 60000),
    ...overrides,
  }

  return defaultSession
}

/**
 * Creates a work pattern for testing overflow scenarios
 */
export function createOverflowWorkPattern(): DailyWorkPattern {
  return createMockWorkPattern({
    blocks: [
      createMockWorkBlock({ id: 'block-1', type: 'focused', startTime: '09:00', endTime: '11:00' }),
      createMockWorkBlock({ id: 'block-2', type: 'admin', startTime: '11:00', endTime: '12:00' }),
      createMockWorkBlock({ id: 'block-3', type: 'blocked', startTime: '12:00', endTime: '13:00' }),
      createMockWorkBlock({ id: 'block-4', type: 'combo', startTime: '13:00', endTime: '15:00' }),
      createMockWorkBlock({ id: 'block-5', type: 'personal', startTime: '15:00', endTime: '17:00' }),
    ],
    totalCapacity: 420,
    totalAccumulated: 450, // 30 minutes overflow
  })
}

/**
 * Creates a work pattern with meetings
 */
export function createWorkPatternWithMeetings(): DailyWorkPattern {
  return createMockWorkPattern({
    blocks: [
      createMockWorkBlock({ type: 'focused', startTime: '09:00', endTime: '10:00' }),
      createMockWorkBlock({ type: 'blocked', startTime: '10:00', endTime: '11:00' }), // Meeting block
      createMockWorkBlock({ type: 'admin', startTime: '11:00', endTime: '12:00' }),
      createMockWorkBlock({ type: 'blocked', startTime: '12:00', endTime: '13:00' }),
      createMockWorkBlock({ type: 'blocked', startTime: '13:00', endTime: '14:00' }), // Another meeting
      createMockWorkBlock({ type: 'combo', startTime: '14:00', endTime: '15:00' }),
      createMockWorkBlock({ type: 'personal', startTime: '15:00', endTime: '17:00' }),
    ],
    meetings: [
      createMockMeeting({ title: 'Daily Standup', startTime: '10:00', endTime: '11:00' }),
      createMockMeeting({ title: 'Sprint Planning', startTime: '13:00', endTime: '14:00' }),
    ],
    totalCapacity: 300, // Reduced by 2 hours of meetings
  })
}

/**
 * Creates a work pattern with sleep block (for night shifts or multi-day views)
 */
export function createWorkPatternWithSleep(): DailyWorkPattern {
  return createMockWorkPattern({
    blocks: [
      createMockWorkBlock({ type: 'sleep', startTime: '00:00', endTime: '07:00' }),
      createMockWorkBlock({ type: 'personal', startTime: '07:00', endTime: '09:00' }),
      createMockWorkBlock({ type: 'focused', startTime: '09:00', endTime: '11:00' }),
      createMockWorkBlock({ type: 'admin', startTime: '11:00', endTime: '12:00' }),
      createMockWorkBlock({ type: 'blocked', startTime: '12:00', endTime: '13:00' }),
      createMockWorkBlock({ type: 'combo', startTime: '13:00', endTime: '15:00' }),
      createMockWorkBlock({ type: 'personal', startTime: '15:00', endTime: '17:00' }),
      createMockWorkBlock({ type: 'personal', startTime: '17:00', endTime: '22:00' }),
      createMockWorkBlock({ type: 'sleep', startTime: '22:00', endTime: '24:00' }),
    ],
  })
}

/**
 * Creates an active work session with pauses
 */
export function createPausedWorkSession(): ActiveWorkSession {
  return createMockActiveWorkSession({
    pausedAt: new Date(Date.now() - 5 * 60000), // Paused 5 minutes ago
    totalPausedTime: 10 * 60000, // Total 10 minutes paused
  })
}

/**
 * Creates a next scheduled item for a workflow step
 */
export function createNextScheduledStep(): NextScheduledItem {
  return createMockNextScheduledItem({
    id: 'step-1',
    title: 'Design API',
    type: 'step',
    taskType: 'focused',
    isStep: true,
    parentId: 'workflow-1',
    parentTitle: 'Feature Implementation',
    estimatedDuration: 60,
  })
}

/**
 * Helper to create multiple work patterns for a week
 */
export function createWeekOfWorkPatterns(): DailyWorkPattern[] {
  const patterns: DailyWorkPattern[] = []
  const today = new Date()

  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const dayOfWeek = date.getDay()

    // Weekend patterns (no work blocks)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      patterns.push(createMockWorkPattern({
        id: `pattern-${i}`,
        date: date.toISOString().split('T')[0],
        dayOfWeek,
        blocks: [
          createMockWorkBlock({ type: 'personal', startTime: '00:00', endTime: '24:00' }),
        ],
        totalCapacity: 0,
        totalAccumulated: 0,
      }))
    } else {
      // Weekday patterns
      patterns.push(createMockWorkPattern({
        id: `pattern-${i}`,
        date: date.toISOString().split('T')[0],
        dayOfWeek,
        // Add some variation in accumulated time
        totalAccumulated: Math.floor(Math.random() * 200),
      }))
    }
  }

  return patterns
}
