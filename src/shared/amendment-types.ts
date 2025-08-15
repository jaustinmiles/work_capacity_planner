/**
 * Types for voice amendments and logging
 */

import { AmendmentType, EntityType, TaskStatus, TaskType } from './enums'

// Re-export enums for convenience
export { AmendmentType, EntityType, TaskStatus, TaskType }

export type AmendmentStatus = 'pending' | 'applied' | 'rejected' | 'error'

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
  stepType: TaskType
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
  addDependencies?: string[]
  removeDependencies?: string[]
}

export interface TaskCreation {
  type: AmendmentType.TaskCreation
  name: string
  description?: string
  duration: number  // minutes
  importance?: number
  urgency?: number
  taskType?: TaskType
}

export interface WorkflowCreation {
  type: AmendmentType.WorkflowCreation
  name: string
  description?: string
  steps: Array<{
    name: string
    duration: number
    type: TaskType
    dependsOn?: string[]
    asyncWaitTime?: number
  }>
  importance?: number
  urgency?: number
}

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
  recentWorkflows: Array<{ id: string; name: string }>
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
