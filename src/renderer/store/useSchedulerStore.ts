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
import { TaskType, UnifiedScheduleItemType, NextScheduledItemType } from '@/shared/enums'

export interface NextScheduledItem {
  type: NextScheduledItemType
  id: string
  workflowId?: string
  title: string
  estimatedDuration: number
  scheduledStartTime: Date
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

// Helper to check if item is a non-work item (meetings, breaks, blocked time, async waits)
function isNonWorkItem(item: UnifiedScheduleItem): boolean {
  return (
    item.type === UnifiedScheduleItemType.Meeting ||
    item.type === UnifiedScheduleItemType.Break ||
    item.type === UnifiedScheduleItemType.BlockedTime ||
    item.type === UnifiedScheduleItemType.AsyncWait
  )
}

// Helper function to get task color based on type
const getTaskColor = (taskType: TaskType): string => {
  switch (taskType) {
    case TaskType.Focused: return '#3b82f6'
    case TaskType.Admin: return '#f59e0b'
    case TaskType.Personal: return '#10b981'
    default: return '#6b7280'
  }
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
    } else if (item.taskType) {
      color = getTaskColor(item.taskType)
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
  if (skipIndex >= workItems.length) {
    // If we've skipped past all available items, wrap back to the first
    // This provides better UX than showing "no tasks"
    const wrappedIndex = skipIndex % workItems.length
    const scheduledItem = workItems[wrappedIndex]
    if (!scheduledItem || !hasStartTime(scheduledItem)) return null

    // Continue with the wrapped item (TypeScript knows startTime exists via type guard)
    const targetItem = scheduledItem

    // Add the rest of the function logic using targetItem
    // Use originalTaskId if this is a split task, otherwise use the item's ID
    const taskId = targetItem.originalTaskId || targetItem.id

    if (targetItem.type === UnifiedScheduleItemType.WorkflowStep) {
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
          scheduledStartTime: targetItem.startTime,
        }
      }
    }

    // Regular task - use original ID for split tasks
    return {
      type: NextScheduledItemType.Task,
      id: taskId,
      title: targetItem.name,
      estimatedDuration: targetItem.duration,
      scheduledStartTime: targetItem.startTime,
    }
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
      }
    }
  }

  // Regular task - use original ID for split tasks
  return {
    type: NextScheduledItemType.Task,
    id: taskId,
    title: itemWithStartTime.name,
    estimatedDuration: itemWithStartTime.duration,
    scheduledStartTime: itemWithStartTime.startTime,
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
          newState.sequencedTasks,
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
