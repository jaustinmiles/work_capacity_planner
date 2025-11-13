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
import { getCurrentTime } from '@/shared/time-provider'
import { logger } from '@/logger'
import { StepStatus, TaskType, UnifiedScheduleItemType } from '@/shared/enums'
import { createWaitBlockId } from '@/shared/step-id-utils'

export interface NextScheduledItem {
  type: 'task' | 'step'
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
  ganttItems: UnifiedScheduleItem[]
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
}

const scheduler = new UnifiedScheduler()

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
    logger.ui.debug('Computing schedule', {
      taskCount: tasks.length,
      sequencedTaskCount: sequencedTasks.length,
      patternCount: workPatterns?.length || 0,
      hasWorkSettings: !!workSettings,
      firstPattern: workPatterns?.[0],
    })

    if (!workPatterns || workPatterns.length === 0) {
      logger.ui.warn('No work patterns available for scheduling')
      return null
    }

    const currentTime = getCurrentTime()
    const startDateString = currentTime.toISOString().split('T')[0]!

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
      debugMode: true,
    }

    const items = [...tasks, ...sequencedTasks]

    logger.ui.debug('Calling scheduler.scheduleForDisplay', {
      itemCount: items.length,
      itemNames: items.map(i => i.name),
      contextStartDate: context.startDate,
      hasWorkPatterns: context.workPatterns.length > 0,
      firstWorkPattern: context.workPatterns[0],
    })

    const result = scheduler.scheduleForDisplay(items, context, config)

    logger.ui.info('Schedule recomputed', {
      totalItems: result.scheduled.length,
      unscheduled: result.unscheduled.length,
      scheduledItems: result.scheduled.map(s => ({
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      unscheduledItems: result.unscheduled.map(u => u.name),
      debugInfo: result.debugInfo,
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

  const currentTime = getCurrentTime()

  // Find all active wait blocks and waiting steps
  const activeWaitBlocks = new Set<string>()
  const waitingStepIds = new Set<string>()

  for (const workflow of sequencedTasks) {
    for (const step of workflow.steps) {
      if (step.status === StepStatus.Waiting && step.completedAt && step.asyncWaitTime) {
        const waitEndTime = new Date(step.completedAt).getTime() + (step.asyncWaitTime * 60000)
        if (waitEndTime > currentTime.getTime()) {
          waitingStepIds.add(step.id)
          activeWaitBlocks.add(createWaitBlockId(step.id, false))
          activeWaitBlocks.add(createWaitBlockId(step.id, true))
        }
      }
    }
  }

  // Filter and sort scheduled items
  const workItems = scheduleResult.scheduled
    .filter(item => {
      if (!item.startTime) return false

      // Filter out non-work items
      if (item.type === 'meeting' ||
          item.type === 'break' ||
          item.type === 'blocked-time' ||
          item.type === 'async-wait') {
        return false
      }

      if (item.isWaitingOnAsync) return false

      // Check dependencies on active wait blocks
      if (item.dependencies?.some(depId => activeWaitBlocks.has(depId))) {
        return false
      }

      // For workflow steps, check status and dependencies
      if (item.type === 'workflow-step' && item.workflowId) {
        const workflow = sequencedTasks.find(seq => seq.id === item.workflowId)
        const step = workflow?.steps.find(s => s.id === item.id)

        if (step?.status === StepStatus.Waiting) return false

        if (step?.dependsOn?.some(depId => waitingStepIds.has(depId))) {
          return false
        }
      }

      return true
    })
    .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())

  if (workItems.length === 0) return null

  // Handle skipIndex bounds properly
  if (skipIndex >= workItems.length) {
    // If we've skipped past all available items, wrap back to the first
    // This provides better UX than showing "no tasks"
    const wrappedIndex = skipIndex % workItems.length
    const scheduledItem = workItems[wrappedIndex]
    if (!scheduledItem?.startTime) return null

    // Continue with the wrapped item
    const targetItem = scheduledItem

    // Add the rest of the function logic using targetItem
    if (targetItem.type === 'workflow-step') {
      const workflow = sequencedTasks.find(seq =>
        seq.steps.some(step => step.id === targetItem.id),
      )
      const step = workflow?.steps.find(s => s.id === targetItem.id)

      if (step && workflow) {
        return {
          type: 'step' as const,
          id: step.id,
          workflowId: workflow.id,
          title: step.name,
          estimatedDuration: step.duration,
          scheduledStartTime: targetItem.startTime,
        }
      }
    }

    // Regular task
    return {
      type: 'task' as const,
      id: targetItem.id,
      title: targetItem.name,
      estimatedDuration: targetItem.duration,
      scheduledStartTime: targetItem.startTime,
    }
  }

  const targetIndex = Math.min(skipIndex, workItems.length - 1)
  const scheduledItem = workItems[targetIndex]

  if (!scheduledItem?.startTime) return null

  // Convert to NextScheduledItem format
  if (scheduledItem.type === 'workflow-step') {
    const workflow = sequencedTasks.find(seq =>
      seq.steps.some(step => step.id === scheduledItem.id),
    )
    const step = workflow?.steps.find(s => s.id === scheduledItem.id)

    if (step && workflow) {
      return {
        type: 'step' as const,
        id: step.id,
        workflowId: workflow.id,
        title: step.name,
        estimatedDuration: step.duration,
        scheduledStartTime: scheduledItem.startTime,
      }
    }
  }

  // Regular task
  return {
    type: 'task' as const,
    id: scheduledItem.id,
    title: scheduledItem.name,
    estimatedDuration: scheduledItem.duration,
    scheduledStartTime: scheduledItem.startTime,
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
    ganttItems: [],
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
        // Compute new schedule
        const scheduleResult = computeSchedule(
          newState.tasks,
          newState.sequencedTasks,
          newState.workPatterns,
          newState.workSettings,
        )

        // Extract derived values and add colors
        const ganttItems = scheduleResult ? addColorsToItems(scheduleResult.scheduled) : []
        const nextScheduledItem = extractNextScheduledItem(
          scheduleResult,
          newState.sequencedTasks,
          state.nextTaskSkipIndex,
        )

        set({
          ...inputs,
          scheduleResult,
          ganttItems,
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
          // Preserve the existing schedule and Gantt items
          scheduleResult: state.scheduleResult,
          ganttItems: state.ganttItems,
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
        ganttItems: state.ganttItems,
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

      const ganttItems = scheduleResult ? addColorsToItems(scheduleResult.scheduled) : []
      const nextScheduledItem = extractNextScheduledItem(
        scheduleResult,
        state.sequencedTasks,
        state.nextTaskSkipIndex,
      )

      set({
        scheduleResult,
        ganttItems,
        nextScheduledItem,
      })
    },
  })),
)

// Note: Recomputation happens automatically in setInputs method
// No need for a separate subscription that could cause infinite loops
