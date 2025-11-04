/**
 * Centralized enums for the application
 * Using enums provides type safety and enables exhaustive checking
 *
 * CRITICAL: These enums SHOULD be used throughout the codebase instead of hardcoded strings!
 * If ESLint reports these as unused, it means we have architectural issues to fix.
 */

// Task and workflow overall status
export enum TaskStatus {
  NotStarted = 'not_started',
  InProgress = 'in_progress',
  Waiting = 'waiting',
  Completed = 'completed',
}

// Step-specific status (includes additional 'skipped' state)
export enum StepStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Waiting = 'waiting',
  Completed = 'completed',
  Skipped = 'skipped',
}

// Task types

export enum TaskType {
  Focused = 'focused',
  Admin = 'admin',
  Personal = 'personal',
  Mixed = 'mixed', // Only used for work blocks in scheduling, not for individual tasks
  Flexible = 'flexible', // For flexible capacity that can be used by any task type
}

// Work block types for scheduling
export enum WorkBlockType {
  Focused = 'focused',
  Admin = 'admin',
  Mixed = 'mixed',
  Flexible = 'flexible',
  Personal = 'personal',
  Blocked = 'blocked',
  Sleep = 'sleep',
}

// Amendment types for voice amendments
export enum AmendmentType {
  StatusUpdate = 'status_update',
  TimeLog = 'time_log',
  NoteAddition = 'note_addition',
  DurationChange = 'duration_change',
  StepAddition = 'step_addition',
  StepRemoval = 'step_removal',
  DependencyChange = 'dependency_change',
  TaskCreation = 'task_creation',
  WorkflowCreation = 'workflow_creation',
  DeadlineChange = 'deadline_change',
  PriorityChange = 'priority_change',
  TypeChange = 'type_change',
}

// Entity types for amendments
export enum EntityType {
  Task = 'task',
  Workflow = 'workflow',
  Step = 'step',
}

// Deadline types
export enum DeadlineType {
  Hard = 'hard',
  Soft = 'soft',
}

// Work session types
export enum WorkSessionType {
  Focused = 'focused',
  Admin = 'admin',
  Meeting = 'meeting',
  Break = 'break',
}

// Days of the week
export enum DayOfWeek {
  Sunday = 0,
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
}

// Task priority levels (derived from importance × urgency)
export enum PriorityLevel {
  Critical = 'critical',  // High importance, high urgency
//   High = 'high',          // High importance or urgency // Removed unused import
//   Medium = 'medium',      // Medium importance and urgency // Removed unused import
//   Low = 'low',            // Low importance or urgency // Removed unused import
}

// View types for the application
export enum ViewType {
  Tasks = 'tasks',
  Matrix = 'matrix',
  Calendar = 'calendar',
  Workflows = 'workflows',
  Timeline = 'timeline',
}

// AI Processing modes for brainstorming
export enum AIProcessingMode {
  Tasks = 'tasks',
  Workflows = 'workflows',
}

/**
 * Helper function to ensure exhaustive checks in switch statements
 * Usage:
 * ```
 * switch (status) {
 *   case TaskStatus.NotStarted:
 *     return 'gray'
 *   case TaskStatus.InProgress:
 *     return 'blue'
 *   case TaskStatus.Waiting:
 *     return 'orange'
 *   case TaskStatus.Completed:
 *     return 'green'
 *   default:
 *     return assertNever(status)
 * }
 * ```
 */
export function assertNever(value: never): never {
  // Provide a more helpful error message for debugging
  const displayValue = typeof value === 'object' && value !== null
    ? JSON.stringify(value, null, 2)
    : String(value)
  throw new Error(`Unexpected value: ${displayValue}`)
}

/**
 * Type guard to check if a string is a valid enum value
 */
export function isValidEnumValue<T extends Record<string, string>>(
  enumObj: T,
  value: string,
): value is T[keyof T] {
  return Object.values(enumObj).includes(value as T[keyof T])
}

/**
 * Safe enum parser with fallback
 */
export function parseEnum<T extends Record<string, string>>(
  enumObj: T,
  value: string,
  fallback: T[keyof T],
): T[keyof T] {
  if (isValidEnumValue(enumObj, value)) {
    return value as T[keyof T]
  }
  return fallback
}
