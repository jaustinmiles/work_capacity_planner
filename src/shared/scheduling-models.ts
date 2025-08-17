import { Task, Meeting } from './types'
import { SequencedTask, TaskStep } from './sequencing-types'
import { TaskType } from './enums'

// Unified model for anything that can be scheduled on the timeline
export interface SchedulableItem {
  id: string
  name: string
  duration: number // minutes
  type: TaskType
  importance: number // 1-10
  urgency: number // 1-10

  // Dependency tracking
  dependsOn: string[] // IDs of other schedulable items
  asyncWaitTime: number // minutes to wait after completion

  // Metadata for tracking
  sourceType: 'simple_task' | 'workflow_step'
  sourceId: string // ID of parent task or workflow
  workflowStepIndex?: number // For workflow steps

  // Status
  status: 'pending' | 'scheduled' | 'in_progress' | 'waiting' | 'completed'
  estimatedStart?: Date
  estimatedEnd?: Date
  actualStart?: Date
  actualEnd?: Date
}

// Represents a scheduled item on the timeline
export interface ScheduledWorkItem extends SchedulableItem {
  scheduledDate: Date
  scheduledStartTime: Date // Exact start time
  scheduledEndTime: Date // Exact end time
  timeSlotId: string

  // Capacity tracking
  consumesFocusedTime: boolean
  consumesAdminTime: boolean

  // Scheduling metadata
  isOptimallyPlaced: boolean // True if scheduled in ideal priority order
  wasRescheduled: boolean // True if moved from original optimal position
  reschedulingReason?: string
}

// User's daily work configuration
export interface WorkDayConfiguration {
  id: string
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'

  // Work hours
  workStartTime: string // "09:00"
  workEndTime: string // "18:00"

  // Break times
  breaks: TimeBreak[]

  // Capacity limits
  maxFocusedMinutes: number // Default: 240 (4 hours)
  maxAdminMinutes: number // Default: 180 (3 hours)

  // Meeting availability
  meetings: Meeting[]
  isWorkingDay: boolean
}

export interface TimeBreak {
  id: string
  name: string // "Lunch", "Coffee break"
  startTime: string // "12:00"
  endTime: string // "13:00"
  recurring: boolean
}

// Represents available time periods for scheduling
export interface TimeSlot {
  id: string
  date: Date
  startTime: Date
  endTime: Date
  durationMinutes: number

  // Capacity information
  availableForFocused: boolean
  availableForAdmin: boolean

  // Current allocation
  allocatedItems: ScheduledWorkItem[]
  remainingFocusedMinutes: number
  remainingAdminMinutes: number

  // Slot type
  slotType: 'work' | 'break' | 'meeting' | 'async_wait'
  isBlocked: boolean
  blockingReason?: string
}

// Scheduling constraints and preferences
export interface SchedulingConstraints {
  // User preferences
  tieBreakingMethod: 'creation_date' | 'duration_shortest' | 'duration_longest' | 'alphabetical'
  allowOverflow: boolean // Whether to schedule beyond capacity

  // Time constraints
  earliestStartDate: Date
  latestEndDate?: Date

  // Dependency rules
  strictDependencies: boolean // True = wait for ALL dependencies

  // Capacity rules
  enforceDailyLimits: boolean
  allowFocusedOvertime: boolean
  allowAdminOvertime: boolean
}

// Result of scheduling operation
export interface SchedulingResult {
  success: boolean
  scheduledItems: ScheduledWorkItem[]
  unscheduledItems: SchedulableItem[]

  // Timeline analysis
  totalWorkDays: number
  totalFocusedHours: number
  totalAdminHours: number
  projectedCompletionDate: Date

  // Capacity analysis
  overCapacityDays: Date[]
  underUtilizedDays: Date[]

  // Conflicts and warnings
  conflicts: SchedulingConflict[]
  warnings: string[]

  // Optimization suggestions
  suggestions: SchedulingOptimization[]
}

export interface SchedulingConflict {
  type: 'dependency_cycle' | 'capacity_exceeded' | 'impossible_deadline' | 'double_booking'
  affectedItems: string[] // IDs of affected schedulable items
  description: string
  severity: 'error' | 'warning' | 'suggestion'
  suggestedResolution?: string
}

export interface SchedulingOptimization {
  type: 'fill_async_wait' | 'reorder_priorities' | 'extend_work_day' | 'add_capacity'
  description: string
  potentialTimeSaved: number // minutes
  affectedItems: string[]
  implementationEffort: 'low' | 'medium' | 'high'
}

// Priority calculation result
export interface PriorityScore {
  itemId: string
  rawScore: number // importance × urgency
  adjustedScore: number // Raw score + dependency weighting + deadline pressure
  tieBreakingValue: number | string
  finalRank: number
}

// For converting existing data to schedulable items
export interface SchedulingConverter {
  convertSimpleTask: (__task: Task) => SchedulableItem
  convertSequencedTask: (sequencedTask: SequencedTask) => SchedulableItem[]
  convertTaskStep: (__step: TaskStep, workflowId: string, __stepIndex: number) => SchedulableItem
}

// Async wait period that can be filled with other tasks
export interface AsyncWaitPeriod {
  id: string
  parentItemId: string
  startTime: Date
  endTime: Date
  durationMinutes: number

  // What can be scheduled during this wait
  canScheduleFocused: boolean
  canScheduleAdmin: boolean

  // Currently scheduled items during wait
  fillerItems: ScheduledWorkItem[]
  remainingCapacity: number
}

// Weekly schedule overview
export interface WeeklySchedule {
  weekStartDate: Date
  workDays: WorkDayConfiguration[]
  scheduledItems: ScheduledWorkItem[]
  totalCapacity: {
    focusedMinutes: number
    adminMinutes: number
  }
  utilization: {
    focusedMinutesUsed: number
    adminMinutesUsed: number
    focusedPercentage: number
    adminPercentage: number
  }
  asyncWaitPeriods: AsyncWaitPeriod[]
}
