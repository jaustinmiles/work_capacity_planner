import { vi } from 'vitest'
import type { Task, SequencedTask } from '@/shared/types'
import type { SchedulerResult, ScheduledItem, UnscheduledItem, SchedulerDebugInfo } from '@/shared/unified-scheduler'
import { TaskType } from '@/shared/types'

/**
 * Creates a mock UnifiedScheduler with all required methods
 */
export function createMockScheduler(overrides?: Partial<ReturnType<typeof useUnifiedScheduler>>) {
  const defaultScheduler = {
    scheduleForDisplay: vi.fn().mockReturnValue({
      scheduled: [],
      unscheduled: [],
      debugInfo: createMockDebugInfo(),
    }),
    scheduleForExecution: vi.fn().mockReturnValue({
      scheduled: [],
      unscheduled: [],
      debugInfo: createMockDebugInfo(),
    }),
    getNextScheduledItem: vi.fn().mockReturnValue(null),
    startNextTask: vi.fn().mockResolvedValue(undefined),

    ...overrides,
  }

  return defaultScheduler
}

/**
 * Creates realistic scheduler debug info for testing
 */
export function createMockDebugInfo(overrides?: Partial<SchedulerDebugInfo>): SchedulerDebugInfo {
  return {
    totalTasks: 0,
    scheduledCount: 0,
    unscheduledCount: 0,
    utilizationRate: 0,
    schedulingMode: 'display',
    optimizationMode: 'balanced',
    messages: [],
    timings: {
      total: 10,
      preprocessing: 2,
      scheduling: 6,
      postprocessing: 2,
    },
    ...overrides,
  }
}

/**
 * Creates a mock scheduled item
 */
export function createMockScheduledItem(overrides?: Partial<ScheduledItem>): ScheduledItem {
  const base: ScheduledItem = {
    id: 'item-1',
    title: 'Mock Task',
    type: 'focused' as TaskType,
    startTime: new Date('2024-01-10T09:00:00'),
    endTime: new Date('2024-01-10T10:00:00'),
    duration: 60,
    priority: 5,
    isStep: false,
    parentId: null,
    status: 'scheduled',
    color: '#4CAF50',
    row: 0,
    actualDuration: 0,
    deadline: undefined,
    progress: 0,
    ...overrides,
  }

  return base
}

/**
 * Creates a mock unscheduled item
 */
export function createMockUnscheduledItem(overrides?: Partial<UnscheduledItem>): UnscheduledItem {
  const base: UnscheduledItem = {
    id: 'unscheduled-1',
    title: 'Unscheduled Task',
    type: 'work' as TaskType,
    duration: 30,
    priority: 3,
    isStep: false,
    parentId: null,
    reason: 'No available time slots',
    ...overrides,
  }

  return base
}

/**
 * Creates a mock scheduler result with realistic data
 */
export function createMockSchedulerResult(options?: {
  scheduledCount?: number
  unscheduledCount?: number
  utilizationRate?: number
}): SchedulerResult {
  const { scheduledCount = 2, unscheduledCount = 1, utilizationRate = 0.75 } = options || {}

  const scheduled: ScheduledItem[] = []
  for (let i = 0; i < scheduledCount; i++) {
    const startHour = 9 + i * 2
    scheduled.push(createMockScheduledItem({
      id: `scheduled-${i}`,
      title: `Task ${i + 1}`,
      startTime: new Date(`2024-01-10T${startHour.toString().padStart(2, '0')}:00:00`),
      endTime: new Date(`2024-01-10T${(startHour + 1).toString().padStart(2, '0')}:00:00`),
      duration: 60,
      row: i,
    }))
  }

  const unscheduled: UnscheduledItem[] = []
  for (let i = 0; i < unscheduledCount; i++) {
    unscheduled.push(createMockUnscheduledItem({
      id: `unscheduled-${i}`,
      title: `Unscheduled Task ${i + 1}`,
      reason: i === 0 ? 'No available time slots' : 'Capacity exceeded',
    }))
  }

  return {
    scheduled,
    unscheduled,
    debugInfo: createMockDebugInfo({
      totalTasks: scheduledCount + unscheduledCount,
      scheduledCount,
      unscheduledCount,
      utilizationRate,
      messages: [
        `Scheduled ${scheduledCount} items`,
        unscheduledCount > 0 ? `${unscheduledCount} items could not be scheduled` : null,
      ].filter(Boolean) as string[],
    }),
  }
}

/**
 * Creates a scheduler that returns workflow items on the same row
 */
export function createWorkflowSchedulerResult(workflow: SequencedTask): SchedulerResult {
  const scheduled: ScheduledItem[] = []
  let currentTime = new Date('2024-01-10T09:00:00')

  workflow.steps?.forEach((step, _index) => {
    const startTime = new Date(currentTime)
    const endTime = new Date(currentTime.getTime() + step.estimatedDuration * 60000)

    scheduled.push({
      id: step.id,
      title: step.name,
      type: workflow.type as TaskType,
      startTime,
      endTime,
      duration: step.estimatedDuration,
      priority: workflow.importance * workflow.urgency,
      isStep: true,
      parentId: workflow.id,
      status: step.status === 'complete' ? 'completed' : 'scheduled',
      color: '#2196F3',
      row: 0, // All steps on the same row
      actualDuration: step.actualDuration || 0,
      progress: step.status === 'complete' ? 100 : 0,
    })

    currentTime = endTime
  })

  return {
    scheduled,
    unscheduled: [],
    debugInfo: createMockDebugInfo({
      totalTasks: workflow.steps?.length || 0,
      scheduledCount: scheduled.length,
      unscheduledCount: 0,
      utilizationRate: 0.8,
      messages: [`Scheduled workflow "${workflow.title}" with ${scheduled.length} steps`],
    }),
  }
}

/**
 * Creates a scheduler that includes meetings and blocked time
 */
export function createSchedulerWithMeetings(
  tasks: Task[],
  meetings: Array<{ title: string; startTime: string; endTime: string }>,
): SchedulerResult {
  const scheduled: ScheduledItem[] = []

  // Add meetings first (always scheduled)
  meetings.forEach((meeting, index) => {
    scheduled.push({
      id: `meeting-${index}`,
      title: meeting.title,
      type: 'admin' as TaskType, // Meetings typically shown as admin type
      startTime: new Date(`2024-01-10T${meeting.startTime}`),
      endTime: new Date(`2024-01-10T${meeting.endTime}`),
      duration: 60, // Calculate from times
      priority: 10, // High priority
      isStep: false,
      parentId: null,
      status: 'scheduled',
      color: '#FF9800',
      row: -1, // Special row for meetings
      actualDuration: 0,
      progress: 0,
      isMeeting: true,
    })
  })

  // Add tasks around meetings
  let currentTime = new Date('2024-01-10T09:00:00')
  const unscheduled: UnscheduledItem[] = []

  tasks.forEach((task, index) => {
    // Check if current time overlaps with any meeting
    const hasConflict = meetings.some(meeting => {
      const meetingStart = new Date(`2024-01-10T${meeting.startTime}`)
      const meetingEnd = new Date(`2024-01-10T${meeting.endTime}`)
      const taskEnd = new Date(currentTime.getTime() + task.estimatedDuration * 60000)
      return (currentTime >= meetingStart && currentTime < meetingEnd) ||
             (taskEnd > meetingStart && taskEnd <= meetingEnd)
    })

    if (hasConflict) {
      unscheduled.push(createMockUnscheduledItem({
        id: task.id,
        title: task.title,
        type: task.type as TaskType,
        duration: task.estimatedDuration,
        reason: 'Conflicts with meeting',
      }))
    } else {
      scheduled.push({
        id: task.id,
        title: task.title,
        type: task.type as TaskType,
        startTime: new Date(currentTime),
        endTime: new Date(currentTime.getTime() + task.estimatedDuration * 60000),
        duration: task.estimatedDuration,
        priority: task.importance * task.urgency,
        isStep: false,
        parentId: null,
        status: 'scheduled',
        color: '#4CAF50',
        row: index,
        actualDuration: task.actualDuration || 0,
        deadline: task.deadline,
        progress: task.status === 'complete' ? 100 : 0,
      })

      currentTime = new Date(currentTime.getTime() + task.estimatedDuration * 60000)
    }
  })

  return {
    scheduled,
    unscheduled,
    debugInfo: createMockDebugInfo({
      totalTasks: tasks.length + meetings.length,
      scheduledCount: scheduled.length,
      unscheduledCount: unscheduled.length,
      utilizationRate: 0.65,
      messages: [
        `${meetings.length} meetings scheduled`,
        `${scheduled.length - meetings.length} tasks scheduled`,
        unscheduled.length > 0 ? `${unscheduled.length} tasks conflicted with meetings` : null,
      ].filter(Boolean) as string[],
    }),
  }
}

/**
 * Mock implementation of useUnifiedScheduler hook
 */
export function useUnifiedScheduler() {
  return createMockScheduler()
}

/**
 * Helper to create a scheduler that simulates deadline violations
 */
export function createSchedulerWithDeadlineViolations(tasks: Task[]): SchedulerResult {
  const scheduled: ScheduledItem[] = []
  const now = new Date()
  let currentTime = new Date(now)

  tasks.forEach((task, index) => {
    const startTime = new Date(currentTime)
    const endTime = new Date(currentTime.getTime() + task.estimatedDuration * 60000)

    // Set deadline before end time for some tasks to create violations
    const hasViolation = index % 2 === 0 && task.deadline
    const deadline = hasViolation
      ? new Date(endTime.getTime() - 30 * 60000) // 30 minutes before end
      : task.deadline

    scheduled.push({
      id: task.id,
      title: task.title,
      type: task.type as TaskType,
      startTime,
      endTime,
      duration: task.estimatedDuration,
      priority: task.importance * task.urgency,
      isStep: false,
      parentId: null,
      status: 'scheduled',
      color: hasViolation ? '#F44336' : '#4CAF50',
      row: index,
      actualDuration: task.actualDuration || 0,
      deadline,
      progress: task.status === 'complete' ? 100 : 0,
      hasDeadlineViolation: hasViolation,
    })

    currentTime = endTime
  })

  return {
    scheduled,
    unscheduled: [],
    debugInfo: createMockDebugInfo({
      totalTasks: tasks.length,
      scheduledCount: scheduled.length,
      unscheduledCount: 0,
      utilizationRate: 0.85,
      messages: [
        `${scheduled.filter(s => s.hasDeadlineViolation).length} tasks violate deadlines`,
      ],
    }),
  }
}
