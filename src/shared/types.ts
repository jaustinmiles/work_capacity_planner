import { TaskStatus, StepStatus, DeadlineType, ChatMessageRole, EndeavorStatus } from './enums'

/**
 * Interface for entities that support time logging
 * Ensures type safety for time tracking operations
 */
export interface TimeLoggable {
  id: string
  name: string
  duration: number // estimated duration in minutes
  actualDuration?: number // actual logged time in minutes
  type?: string // User-defined task type ID (optional for workflows, required for tasks/steps)
}

export interface Session {
  id: string
  name: string
  description?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Task extends TimeLoggable {
  // Inherited from TimeLoggable: id, name, duration, actualDuration, type
  importance: number // 1-10
  urgency: number // 1-10
  asyncWaitTime: number // minutes
  dependencies: string[] // task IDs
  completed: boolean
  completedAt?: Date
  deadline?: Date // deadline for task
  deadlineType?: DeadlineType // type of deadline
  cognitiveComplexity?: 1 | 2 | 3 | 4 | 5 // cognitive load rating
  isLocked?: boolean // whether task is locked to specific time
  lockedStartTime?: Date // specific time task must start
  sessionId: string
  createdAt: Date
  updatedAt: Date
  notes?: string
  projectId?: string // for grouping

  // Workflow support
  hasSteps: boolean
  currentStepId?: string
  overallStatus: TaskStatus
  criticalPathDuration: number
  worstCaseDuration: number
  steps?: TaskStep[] // Optional - populated when needed
  archived: boolean // whether task/workflow is archived
  inActiveSprint: boolean // sprint membership for focus mode

  // For async optimization (computed, not stored)
  isAsyncTrigger?: boolean
}

export interface TaskStep extends TimeLoggable {
  // Inherited from TimeLoggable: id, name, duration, actualDuration
  type: string // Required for steps (overrides optional from TimeLoggable)
  taskId: string
  dependsOn: string[] // step IDs
  asyncWaitTime: number
  status: StepStatus
  stepIndex: number
  startedAt?: Date
  completedAt?: Date
  percentComplete: number
  notes?: string
  cognitiveComplexity?: 1 | 2 | 3 | 4 | 5 // cognitive load rating
  isAsyncTrigger?: boolean // marks steps that kick off async work
  expectedResponseTime?: number // expected wait time in minutes
  importance?: number // 1-10, optional override for individual step priority
  urgency?: number // 1-10, optional override for individual step priority
}

/**
 * Represents a scheduled item (task or workflow step) returned by the scheduler
 * Used for "Start Next Task" functionality
 */
export interface NextScheduledItem {
  type: 'task' | 'step'
  id: string
  workflowId?: string
  title: string
  estimatedDuration: number
  scheduledStartTime?: Date
}

export interface DailySchedule {
  id: string
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday'
  startTime: string // "09:00"
  endTime: string // "18:00"
  meetings: Meeting[]
}

export interface Meeting {
  id: string
  name: string
  startTime: string
  endTime: string
  recurring: boolean
}

export interface ScheduledTask {
  taskId: string
  scheduledDate: Date
  scheduledMinutes: number
  isPartial: boolean
  isStart: boolean
  isEnd: boolean
}

export interface Project {
  id: string
  name: string
  color: string
  createdAt: Date
}

export interface TaskFilters {
  completed?: boolean
  type?: string // User-defined task type ID
  projectId?: string
  search?: string
  inActiveSprint?: boolean // Filter by sprint membership
}

export interface ProductivityPattern {
  id: string
  sessionId: string
  timeRangeStart: string // "09:00"
  timeRangeEnd: string // "12:00"
  cognitiveCapacity: 'peak' | 'high' | 'moderate' | 'low'
  preferredComplexity: number[] // [4, 5] for complex tasks during peak
  createdAt: Date
  updatedAt: Date
}

export interface SchedulingPreferences {
  id: string
  sessionId: string
  allowWeekendWork: boolean
  weekendPenalty: number // 0-1, how much to avoid weekends
  contextSwitchPenalty: number // minutes lost per context switch
  asyncParallelizationBonus: number // priority bonus for async work
  createdAt: Date
  updatedAt: Date
}

/**
 * Type guard to check if an entity supports time logging
 * @param entity - The entity to check
 * @returns true if the entity implements TimeLoggable interface
 */
export function isTimeLoggable(entity: unknown): entity is TimeLoggable {
  return (
    typeof entity === 'object' &&
    entity !== null &&
    'id' in entity &&
    'name' in entity &&
    'duration' in entity &&
    'type' in entity &&
    typeof (entity as any).id === 'string' &&
    typeof (entity as any).name === 'string' &&
    typeof (entity as any).duration === 'number' &&
    typeof (entity as any).type === 'string'
  )
}

/**
 * Options for AI chat API calls
 * Used across main, preload, and renderer for consistent AI interaction
 */
export interface AICallOptions {
  systemPrompt: string
  messages: Array<{ role: ChatMessageRole.User | ChatMessageRole.Assistant; content: string }>
  model?: string
  maxTokens?: number
}

// =============================================================================
// Endeavor Types - Higher-level grouping for workflows and tasks
// =============================================================================

/**
 * Endeavor - A higher-level construct to group related workflows and tasks
 * Represents a significant goal or project that may span multiple workflows
 */
export interface Endeavor {
  id: string
  name: string
  description?: string
  notes?: string
  status: EndeavorStatus
  importance: number // 1-10 priority scale
  urgency: number // 1-10 urgency scale
  deadline?: Date
  deadlineType?: DeadlineType
  color?: string // Hex color for UI
  sessionId: string
  createdAt: Date
  updatedAt: Date
}

/**
 * EndeavorItem - Links tasks/workflows to endeavors with ordering
 */
export interface EndeavorItem {
  id: string
  endeavorId: string
  taskId: string
  sortOrder: number
  addedAt: Date
}

/**
 * EndeavorWithTasks - Endeavor with populated task relationships
 * Used for displaying endeavor details with full task info
 */
export interface EndeavorWithTasks extends Endeavor {
  items: Array<EndeavorItem & { task: Task }>
}

/**
 * EndeavorProgress - Calculated progress for an endeavor
 */
export interface EndeavorProgress {
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  totalDuration: number // in minutes
  completedDuration: number // in minutes
  percentComplete: number // 0-100
}

// =============================================================================
// Cross-Workflow Step Dependencies
// =============================================================================

/**
 * EndeavorDependency - Cross-workflow step dependency
 * Allows blocking a workflow/step until a specific step from another workflow completes
 * Dependencies can cross endeavor boundaries
 */
export interface EndeavorDependency {
  id: string
  endeavorId: string

  // What is being blocked (one of these will be set)
  blockedTaskId?: string  // A workflow being blocked
  blockedStepId?: string  // OR a specific step being blocked

  // What is doing the blocking (always a step)
  blockingStepId: string  // The step that must complete first
  blockingTaskId: string  // Parent workflow of blocking step

  // Metadata
  isHardBlock: boolean    // true = blocks scheduler, false = warning only
  notes?: string
  createdAt: Date
}

/**
 * EndeavorDependency with resolved names for display
 */
export interface EndeavorDependencyWithNames extends EndeavorDependency {
  blockedTaskName?: string
  blockedStepName?: string
  blockingStepName: string
  blockingTaskName: string
  blockingStepStatus: string  // Current status of the blocking step
  blockingEndeavorId?: string // Endeavor the blocking task belongs to
  blockingEndeavorName?: string
}

/**
 * Input for creating an endeavor dependency
 */
export interface CreateEndeavorDependencyInput {
  endeavorId: string
  blockedTaskId?: string
  blockedStepId?: string
  blockingStepId: string
  isHardBlock?: boolean
  notes?: string
}
