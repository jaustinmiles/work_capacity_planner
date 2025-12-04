/**
 * Types for voice amendments and logging
 */

import {
  AmendmentType,
  EntityType,
  TaskStatus,
  DeadlineType,
  WorkPatternOperation,
  WorkSessionOperation,
  WorkBlockType,
  RecurringPattern,
  DayOfWeek,
  AmendmentStatus,
} from './enums'

// Re-export enums for convenience
export {
  AmendmentType,
  EntityType,
  TaskStatus,
  DeadlineType,
  WorkPatternOperation,
  WorkSessionOperation,
  WorkBlockType,
  RecurringPattern,
  DayOfWeek,
  AmendmentStatus,
}

export interface AmendmentTarget {
  type: EntityType
  id?: string
  name: string
  confidence: number  // 0-1 confidence in the match
  alternatives?: Array<{
    id: string
    name: string
    confidence: number
  }>
}

export interface StatusUpdate {
  type: AmendmentType.StatusUpdate
  target: AmendmentTarget
  currentStatus?: string
  newStatus: TaskStatus
  stepName?: string  // For workflow step updates
}

export interface TimeLog {
  type: AmendmentType.TimeLog
  target: AmendmentTarget
  duration: number  // minutes
  date?: Date  // Defaults to today
  startTime?: Date
  endTime?: Date
  description?: string
  stepName?: string  // For logging time to specific workflow step
}

export interface NoteAddition {
  type: AmendmentType.NoteAddition
  target: AmendmentTarget
  note: string
  append: boolean  // Append to existing notes or replace
  stepName?: string  // For adding notes to specific workflow step
}

export interface DurationChange {
  type: AmendmentType.DurationChange
  target: AmendmentTarget
  currentDuration?: number
  newDuration: number  // minutes
  reason?: string
  stepName?: string  // For changing duration of specific workflow step
}

export interface StepAddition {
  type: AmendmentType.StepAddition
  workflowTarget: AmendmentTarget
  stepName: string
  duration: number
  stepType: string // User-defined task type ID
  afterStep?: string  // Name of step to insert after
  beforeStep?: string  // Name of step to insert before
  dependencies?: string[]
  asyncWaitTime?: number  // Optional async wait time for the step
}

export interface StepRemoval {
  type: AmendmentType.StepRemoval
  workflowTarget: AmendmentTarget
  stepName: string
  reason?: string
}

export interface DependencyChange {
  type: AmendmentType.DependencyChange
  target: AmendmentTarget
  stepName: string
  addDependencies?: string[]  // Tasks that this task depends on
  removeDependencies?: string[]  // Tasks to remove from dependencies
  addDependents?: string[]  // Tasks that should depend on this task (reverse dependencies)
  removeDependents?: string[]  // Tasks to remove from dependents
}

export interface TaskCreation {
  type: AmendmentType.TaskCreation
  name: string
  description?: string
  duration: number  // minutes
  importance?: number
  urgency?: number
  taskType?: string // User-defined task type ID
}

export interface WorkflowCreation {
  type: AmendmentType.WorkflowCreation
  name: string
  description?: string
  steps: Array<{
    name: string
    duration: number
    type: string // User-defined task type ID
    dependsOn?: string[]
    asyncWaitTime?: number
  }>
  importance?: number
  urgency?: number
}

export interface DeadlineChange {
  type: AmendmentType.DeadlineChange
  target: AmendmentTarget
  newDeadline: Date
  deadlineType?: DeadlineType
  stepName?: string  // For changing step deadline if applicable
}

export interface PriorityChange {
  type: AmendmentType.PriorityChange
  target: AmendmentTarget
  importance?: number  // 1-10
  urgency?: number  // 1-10
  cognitiveComplexity?: 1 | 2 | 3 | 4 | 5
  stepName?: string  // For changing step priority if applicable
}

export interface TypeChange {
  type: AmendmentType.TypeChange
  target: AmendmentTarget
  newType: string // User-defined task type ID
  stepName?: string  // For changing step type
}

export interface WorkPatternModification {
  type: AmendmentType.WorkPatternModification
  date: Date  // Transformed from ISO string
  operation: WorkPatternOperation
  blockId?: string  // For modify/remove operations
  meetingId?: string  // For modify/remove operations
  blockData?: {
    startTime: Date  // Transformed from ISO string
    endTime: Date
    type: WorkBlockType
    splitRatio?: Record<string, number>  // For mixed blocks
  }
  meetingData?: {
    name: string
    startTime: Date  // Transformed from ISO string
    endTime: Date
    type: string // Meeting type
    recurring?: RecurringPattern
    daysOfWeek?: DayOfWeek[]
  }
}

export interface WorkSessionEdit {
  type: AmendmentType.WorkSessionEdit
  operation: WorkSessionOperation
  sessionId?: string  // For update/delete operations
  taskId?: string  // For create operation or split target
  stepId?: string  // Optional, for step-specific sessions
  startTime?: Date
  endTime?: Date
  plannedMinutes?: number
  actualMinutes?: number
  notes?: string
  // For split operation
  splitSessions?: Array<{
    taskId: string
    stepId?: string
    actualMinutes: number
    notes?: string
  }>
}

export interface ArchiveToggle {
  type: AmendmentType.ArchiveToggle
  target: AmendmentTarget
  archive: boolean  // true = archive, false = unarchive
  reason?: string
}

export interface QueryResponse {
  type: AmendmentType.QueryResponse
  query: string  // Original user query
  response: string  // AI's text response
  relevantEntities?: Array<{
    type: EntityType
    id: string
    name: string
  }>
}

export interface TaskTypeCreation {
  type: AmendmentType.TaskTypeCreation
  name: string    // Type display name (required)
  emoji: string   // Emoji icon (required)
  color: string   // Hex color like "#RRGGBB" (required)
}

// ============================================================================
// RAW TYPES - What AI returns (all date/time fields are ISO strings)
// These are used immediately after JSON.parse() before transformation
// ============================================================================

/**
 * Raw TimeLog from AI - dates are ISO strings
 */
export interface RawTimeLog {
  type: AmendmentType.TimeLog
  target: AmendmentTarget
  duration: number
  date?: string  // ISO date string from AI
  startTime?: string  // ISO datetime string
  endTime?: string
  description?: string
  stepName?: string
}

/**
 * Raw DeadlineChange from AI - deadline is ISO string
 */
export interface RawDeadlineChange {
  type: AmendmentType.DeadlineChange
  target: AmendmentTarget
  newDeadline: string  // ISO date string from AI
  deadlineType?: DeadlineType
  stepName?: string
}

/**
 * Raw WorkPatternModification from AI - all times are ISO strings
 */
export interface RawWorkPatternModification {
  type: AmendmentType.WorkPatternModification
  date: string  // ISO date string from AI
  operation: WorkPatternOperation
  blockId?: string
  meetingId?: string
  blockData?: {
    startTime: string  // ISO datetime string
    endTime: string
    type: WorkBlockType
    splitRatio?: Record<string, number>
  }
  meetingData?: {
    name: string
    startTime: string  // ISO datetime string
    endTime: string
    type: string // Meeting type
    recurring?: RecurringPattern
    daysOfWeek?: DayOfWeek[]
  }
}

/**
 * Raw WorkSessionEdit from AI - times are ISO strings
 */
export interface RawWorkSessionEdit {
  type: AmendmentType.WorkSessionEdit
  operation: WorkSessionOperation
  sessionId?: string
  taskId?: string
  stepId?: string
  startTime?: string  // ISO datetime string
  endTime?: string
  plannedMinutes?: number
  actualMinutes?: number
  notes?: string
  splitSessions?: Array<{
    taskId: string
    stepId?: string
    actualMinutes: number
    notes?: string
  }>
}

/**
 * Union of all raw amendment types (what AI returns)
 * Types without date fields pass through unchanged
 */
export type RawAmendment =
  | StatusUpdate  // No date fields
  | RawTimeLog
  | NoteAddition  // No date fields
  | DurationChange  // No date fields
  | StepAddition  // No date fields
  | StepRemoval  // No date fields
  | DependencyChange  // No date fields
  | TaskCreation  // No date fields
  | WorkflowCreation  // No date fields
  | RawDeadlineChange
  | PriorityChange  // No date fields
  | TypeChange  // No date fields
  | RawWorkPatternModification
  | RawWorkSessionEdit
  | ArchiveToggle  // No date fields
  | QueryResponse  // No date fields
  | TaskTypeCreation  // No date fields

// ============================================================================
// TRANSFORMED TYPES - What application code uses (proper JS Date objects)
// These are used after transformAmendments() processes the raw types
// ============================================================================

export type Amendment =
  | StatusUpdate
  | TimeLog
  | NoteAddition
  | DurationChange
  | StepAddition
  | StepRemoval
  | DependencyChange
  | TaskCreation
  | WorkflowCreation
  | DeadlineChange
  | PriorityChange
  | TypeChange
  | WorkPatternModification
  | WorkSessionEdit
  | ArchiveToggle
  | QueryResponse
  | TaskTypeCreation

export interface AmendmentResult {
  amendments: Amendment[]
  transcription: string
  confidence: number  // Overall confidence
  warnings?: string[]
  needsClarification?: string[]
}

export interface AmendmentContext {
  // Current context to help with parsing
  activeTaskId?: string
  activeWorkflowId?: string
  activeStepId?: string
  recentTasks: Array<{ id: string; name: string }>
  recentWorkflows: Array<{
    id: string
    name: string
    steps?: Array<{ id: string; name: string }>
  }>
  currentView?: 'tasks' | 'workflows' | 'calendar' | 'matrix'
  jobContexts?: Array<{
    role?: string
    context?: string
    jargonDictionary?: Record<string, string>
  }>
}

export interface ParsedTimePhrase {
  duration?: number  // in minutes
  startTime?: Date
  endTime?: Date
  date?: Date
  raw: string
}

export interface ParsedIntent {
  action: string  // The main verb/action
  entity?: string  // What's being acted upon
  attributes: Record<string, any>
  confidence: number
}
