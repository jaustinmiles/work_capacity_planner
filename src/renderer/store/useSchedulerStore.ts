/**
 * REACTIVE SCHEDULER STORE
 *
 * Single source of truth for all scheduling computations.
 * Automatically recomputes schedule when inputs change.
 * No events, no manual refreshes, pure reactivity.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { UnifiedScheduler, OptimizationMode, UnifiedScheduleItem, ScheduleResult } from '@/shared/unified-scheduler'
import { Task } from '@/shared/types'
import { SequencedTask } from '@/shared/sequencing-types'
import { DailyWorkPattern } from '@/shared/work-blocks-types'
import { WorkSettings, DEFAULT_WORK_SETTINGS } from '@/shared/work-settings-types'
import { getCurrentTime, getLocalDateString } from '@/shared/time-provider'
import { logger } from '@/logger'
import { UnifiedScheduleItemType, NextScheduledItemType } from '@/shared/enums'
import { useUserTaskTypeStore } from './useUserTaskTypeStore'

export interface NextScheduledItem {
  type: NextScheduledItemType
  id: string
  workflowId?: string
  title: string
  estimatedDuration: number
  scheduledStartTime: Date
  /** Logged time in minutes (for showing remaining time) */
  loggedMinutes: number
  /** Workflow name (for step items, to show context) */
  workflowName?: string
}

interface SchedulerStoreState {
  // Inputs (will be set from other stores)
  tasks: Task[]
  sequencedTasks: SequencedTask[]
  workPatterns: DailyWorkPattern[]
  workSettings: WorkSettings | null
  activeWorkSessions: Set<string>

  // Computed schedule result
  scheduleResult: ScheduleResult | null

  // Derived values (computed from schedule result)
  scheduledItems: UnifiedScheduleItem[]
  nextScheduledItem: NextScheduledItem | null
  nextTaskSkipIndex: number

  // Actions
  setInputs: (inputs: {
    tasks?: Task[]
    sequencedTasks?: SequencedTask[]
    workPatterns?: DailyWorkPattern[]
    workSettings?: WorkSettings | null
    activeWorkSessions?: Set<string>
  }) => void
  setNextTaskSkipIndex: (index: number) => void
  recomputeSchedule: () => void
  clearSchedule: () => void
}

const scheduler = new UnifiedScheduler()

// Defensive debouncing: Track last recomputation time to detect rapid-fire calls
const recomputeTracker = { lastTime: 0 }
const RECOMPUTE_DEBOUNCE_MS = 50 // If recomputations happen within 50ms, log a warning

// Helper to check if item has required startTime
function hasStartTime(item: UnifiedScheduleItem): item is UnifiedScheduleItem & { startTime: Date } {
  return item.startTime !== undefined && item.startTime !== null
}

// Helper to check if item is a non-work item or not available for work
// Filters: meetings, breaks, blocked time, async waits, completed items, and items waiting on async
function isNonWorkItem(item: UnifiedScheduleItem): boolean {
  // Filter by item type
  if (
    item.type === UnifiedScheduleItemType.Meeting ||
    item.type === UnifiedScheduleItemType.Break ||
    item.type === UnifiedScheduleItemType.BlockedTime ||
    item.type === UnifiedScheduleItemType.AsyncWait
  ) {
    return true
  }

  // Filter by item state - completed tasks should not be in the queue
  if (item.completed === true) {
    return true
  }

  // Filter items waiting on async timers - they can't be started yet
  if (item.isWaitingOnAsync === true) {
    return true
  }

  return false
}

// Helper function to get task color based on type ID
// Uses user-configurable types from UserTaskTypeStore with fallbacks for legacy IDs
const getTaskColor = (taskTypeId: string): string => {
  // Get color from user task type store (non-reactive access for use outside components)
  const userTypes = useUserTaskTypeStore.getState().types
  const userType = userTypes.find(t => t.id === taskTypeId)
  if (userType) {
    return userType.color
  }

  // Default color for unknown types
  return '#6b7280'
}

// Helper function to add colors to schedule items
const addColorsToItems = (items: UnifiedScheduleItem[]): UnifiedScheduleItem[] => {
  return items.map(item => {
    // Determine color based on item type
    let color = '#6b7280' // default gray

    if (item.type === UnifiedScheduleItemType.AsyncWait) {
      color = '#FF7D00' // Orange for waiting
    } else if (item.type === UnifiedScheduleItemType.Meeting) {
      color = '#8b5cf6' // Purple for meetings
    } else if (item.type === UnifiedScheduleItemType.Break) {
      color = '#06b6d4' // Cyan for breaks
    } else if (item.type === UnifiedScheduleItemType.BlockedTime) {
      color = '#64748b' // Slate for blocked time
    } else if (item.taskTypeId) {
      color = getTaskColor(item.taskTypeId)
    }

    return {
      ...item,
      color,
    }
  })
}

const computeSchedule = (
  tasks: Task[],
  sequencedTasks: SequencedTask[],
  workPatterns: DailyWorkPattern[],
  workSettings: WorkSettings | null,
): ScheduleResult | null => {
  try {
    if (!workPatterns || workPatterns.length === 0) {
      logger.ui.warn('No work patterns available for scheduling')
      return null
    }

    const currentTime = getCurrentTime()
    const startDateString = getLocalDateString(currentTime)

    // Debug: Log time and date calculation with timezone validation
    logger.ui.info('Scheduler time context', {
      currentTime: currentTime.toISOString(),
      currentTimeLocal: currentTime.toString(),
      startDateString,
      patternDates: workPatterns.map(p => p.date),
      taskCount: tasks.length,
      workflowCount: sequencedTasks.length,
      dateMatch: workPatterns.some(p => p.date === startDateString),
    }, 'scheduler-time-debug')

    const context = {
      startDate: startDateString,
      tasks,
      workflows: sequencedTasks,
      workPatterns,
      workSettings: workSettings || DEFAULT_WORK_SETTINGS,
      currentTime,
    }

    const config = {
      startDate: currentTime,
      allowTaskSplitting: true,
      respectMeetings: true,
      optimizationMode: OptimizationMode.Realistic,
      debugMode: false, // Disable verbose scheduler debug logs
    }

    const items = [...tasks, ...sequencedTasks]

    // Warn if trying to schedule with no items
    if (items.length === 0) {
      logger.ui.warn('Attempting to schedule with 0 tasks/workflows - schedule will be empty', {
        workPatternCount: workPatterns.length,
        patternDates: workPatterns.map(p => p.date),
      }, 'empty-schedule')
    }

    const result = scheduler.scheduleForDisplay(items, context, config)

    logger.ui.info('Schedule recomputed', {
      totalItems: result.scheduled.length,
      unscheduled: result.unscheduled.length,
      scheduledNames: result.scheduled.map(s => s.name),
      unscheduledNames: result.unscheduled.map(u => u.name),
      startDate: startDateString,
    }, 'scheduler-recompute')

    return result
  } catch (error) {
    logger.ui.error('Failed to compute schedule', {
      error: error instanceof Error ? error.message : String(error),
    }, 'scheduler-error')
    return null
  }
}

const extractNextScheduledItem = (
  scheduleResult: ScheduleResult | null,
  tasks: Task[],
  sequencedTasks: SequencedTask[],
  skipIndex: number,
): NextScheduledItem | null => {
  if (!scheduleResult) return null

  // Filter and sort scheduled items to find work items (exclude wait blocks and non-work items)
  const workItems = scheduleResult.scheduled
    .filter(item => {
      if (!item.startTime) return false

      // Filter out non-work items (wait blocks, meetings, breaks, blocked time)
      if (isNonWorkItem(item)) {
        return false
      }

      return true
    })
    .sort((a, b) => {
      const aTime = a.startTime?.getTime() ?? 0
      const bTime = b.startTime?.getTime() ?? 0
      return aTime - bTime
    })

  if (workItems.length === 0) return null

  // Handle skipIndex bounds properly
  // If we've skipped past all available items, return null (no more tasks)
  // This is better than wrapping which causes completed tasks to reappear
  if (skipIndex >= workItems.length) {
    return null
  }

  const targetIndex = Math.min(skipIndex, workItems.length - 1)
  const scheduledItem = workItems[targetIndex]

  if (!scheduledItem || !hasStartTime(scheduledItem)) return null

  // TypeScript knows startTime exists via type guard
  const itemWithStartTime = scheduledItem

  // Use originalTaskId if this is a split task, otherwise use the item's ID
  const taskId = itemWithStartTime.originalTaskId || itemWithStartTime.id

  // Convert to NextScheduledItem format
  if (itemWithStartTime.type === UnifiedScheduleItemType.WorkflowStep) {
    const workflow = sequencedTasks.find(seq =>
      seq.steps.some(step => step.id === taskId),
    )
    const step = workflow?.steps.find(s => s.id === taskId)

    if (step && workflow) {
      return {
        type: NextScheduledItemType.Step,
        id: step.id,
        workflowId: workflow.id,
        title: step.name,
        estimatedDuration: step.duration,
        scheduledStartTime: itemWithStartTime.startTime,
        loggedMinutes: step.actualDuration ?? 0,
        workflowName: workflow.name,
      }
    }
  }

  // Regular task - look up actual logged time from task data
  const task = tasks.find(t => t.id === taskId)
  return {
    type: NextScheduledItemType.Task,
    id: taskId,
    title: itemWithStartTime.name,
    estimatedDuration: itemWithStartTime.duration,
    scheduledStartTime: itemWithStartTime.startTime,
    loggedMinutes: task?.actualDuration ?? 0,
  }
}

export const useSchedulerStore = create<SchedulerStoreState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    tasks: [],
    sequencedTasks: [],
    workPatterns: [],
    workSettings: null,
    activeWorkSessions: new Set(),
    scheduleResult: null,
    scheduledItems: [],
    nextScheduledItem: null,
    nextTaskSkipIndex: 0,

    setInputs: (inputs) => {
      const state = get()
      const newState = { ...state, ...inputs }

      // Check if we need to recompute the schedule
      // Active work sessions changing doesn't require schedule recomputation
      // Only changes to tasks, workflows, patterns, or settings do
      const needsScheduleRecompute =
        inputs.tasks !== undefined ||
        inputs.sequencedTasks !== undefined ||
        inputs.workPatterns !== undefined ||
        inputs.workSettings !== undefined

      if (needsScheduleRecompute) {
        // Defensive check: Detect rapid-fire recomputations (subscription storm)
        const now = Date.now()
        if (now - recomputeTracker.lastTime < RECOMPUTE_DEBOUNCE_MS) {
          logger.ui.warn('[setInputs] Rapid-fire recomputation detected', {
            timeSinceLastMs: now - recomputeTracker.lastTime,
            inputKeys: Object.keys(inputs),
          }, 'scheduler-subscription-storm')
        }
        recomputeTracker.lastTime = now

        // Check for data issues and log them, but continue processing
        // This ensures transparency - the UI shows the actual state even if it's broken
        const hasCorruptedTasks = newState.tasks.some(t => !t.id || t.id === '')
        const hasCorruptedWorkflows = newState.sequencedTasks.some(t => !t.id || !t.steps || t.id === '')

        if (hasCorruptedTasks || hasCorruptedWorkflows) {
          // Log the issue for debugging, but don't hide it from the user
          logger.ui.error('[setInputs] Data issues detected - UI will show actual state', {
            corruptedTasks: hasCorruptedTasks,
            corruptedWorkflows: hasCorruptedWorkflows,
            taskIds: newState.tasks.map(t => t.id || '<missing>'),
            workflowIds: newState.sequencedTasks.map(t => t.id || '<missing>'),
          }, 'scheduler-data-issues')
        }

        // Always compute new schedule - transparency over hiding problems
        // Filter out any corrupted items to prevent crashes
        const validTasks = newState.tasks.filter(t => t.id && t.id !== '')
        const validWorkflows = newState.sequencedTasks.filter(t => t.id && t.id !== '' && t.steps)

        const scheduleResult = computeSchedule(
          validTasks,
          validWorkflows,
          newState.workPatterns,
          newState.workSettings,
        )

        // Extract derived values and add colors
        const scheduledItems = scheduleResult ? addColorsToItems(scheduleResult.scheduled) : []
        const nextScheduledItem = extractNextScheduledItem(
          scheduleResult,
          validTasks,
          validWorkflows,
          state.nextTaskSkipIndex,
        )

        set({
          ...inputs,
          scheduleResult,
          scheduledItems,
          nextScheduledItem,
        })
      } else if (inputs.activeWorkSessions !== undefined) {
        // If only active work sessions changed, just update the next scheduled item
        // This prevents the Gantt chart from being cleared unnecessarily
        const nextScheduledItem = extractNextScheduledItem(
          state.scheduleResult,
          state.tasks,
          state.sequencedTasks,
          state.nextTaskSkipIndex,
        )

        set({
          ...inputs,
          nextScheduledItem,
          // Preserve the existing schedule and scheduled items
          scheduleResult: state.scheduleResult,
          scheduledItems: state.scheduledItems,
        })
      } else {
        set(inputs)
      }
    },

    setNextTaskSkipIndex: (index) => {
      const state = get()
      const nextScheduledItem = extractNextScheduledItem(
        state.scheduleResult,
        state.tasks,
        state.sequencedTasks,
        index,
      )
      // Only update skip index and next item, preserve everything else
      // This prevents the Gantt chart from being wiped
      set({
        nextTaskSkipIndex: index,
        nextScheduledItem,
        // Explicitly preserve other state to prevent unwanted re-renders
        scheduledItems: state.scheduledItems,
        scheduleResult: state.scheduleResult,
      })
    },

    recomputeSchedule: () => {
      const state = get()
      const scheduleResult = computeSchedule(
        state.tasks,
        state.sequencedTasks,
        state.workPatterns,
        state.workSettings,
      )

      const scheduledItems = scheduleResult ? addColorsToItems(scheduleResult.scheduled) : []
      const nextScheduledItem = extractNextScheduledItem(
        scheduleResult,
        state.tasks,
        state.sequencedTasks,
        state.nextTaskSkipIndex,
      )

      set({
        scheduleResult,
        scheduledItems,
        nextScheduledItem,
      })
    },

    clearSchedule: () => {
      logger.ui.info('Clearing schedule for session switch', {}, 'schedule-clear')
      set({
        tasks: [],
        sequencedTasks: [],
        workPatterns: [],
        workSettings: null,
        activeWorkSessions: new Set(),
        scheduleResult: null,
        scheduledItems: [],
        nextScheduledItem: null,
        nextTaskSkipIndex: 0,
      })
    },
  })),
)

// Note: Recomputation happens automatically in setInputs method
// No need for a separate subscription that could cause infinite loops
