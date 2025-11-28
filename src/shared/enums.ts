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

// Gantt chart item types
export enum GanttItemType {
  Task = 'task',
  WorkflowStep = 'workflow-step',
  Meeting = 'meeting',
  BlockedTime = 'blocked-time',
  AsyncWait = 'async-wait',
}

// Unified schedule item types
export enum UnifiedScheduleItemType {
  Task = 'task',
  WorkflowStep = 'workflow-step',
  AsyncWait = 'async-wait',
  Meeting = 'meeting',
  Break = 'break',
  BlockedTime = 'blocked-time',
}

// Next scheduled item types (for UI display)
export enum NextScheduledItemType {
  Task = 'task',
  Step = 'step',
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

// Amendment types for voice amendments and brainstorm chat
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
  WorkPatternModification = 'work_pattern_modification',
  WorkSessionEdit = 'work_session_edit',
  ArchiveToggle = 'archive_toggle',
  QueryResponse = 'query_response',
}

// Work pattern modification operations
export enum WorkPatternOperation {
  AddBlock = 'add_block',
  RemoveBlock = 'remove_block',
  ModifyBlock = 'modify_block',
  AddMeeting = 'add_meeting',
  RemoveMeeting = 'remove_meeting',
  ModifyMeeting = 'modify_meeting',
}

// Work session edit operations
export enum WorkSessionOperation {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  Split = 'split',
}

// Chat message roles for brainstorm chat
export enum ChatMessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}

// Recurring pattern types for meetings and work blocks
export enum RecurringPattern {
  None = 'none',
  Daily = 'daily',
  Weekly = 'weekly',
  Custom = 'custom',
}

// Amendment status tracking
export enum AmendmentStatus {
  Pending = 'pending',
  Applied = 'applied',
  Rejected = 'rejected',
  Error = 'error',
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

// Notification types for UI alerts and messages
export enum NotificationType {
  Success = 'success',
  Error = 'error',
  Info = 'info',
  Warning = 'warning',
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
  Schedule = 'schedule',
}

// AI Processing modes for brainstorming
export enum AIProcessingMode {
  Tasks = 'tasks',
  Workflows = 'workflows',
}

// JSON Schema primitive types (for schema generation/validation)
export enum JsonSchemaType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Object = 'object',
  Array = 'array',
  Integer = 'integer',
  Null = 'null',
}

// Re-export enum utility functions from enum-utils.ts for backwards compatibility
// These functions are now defined in enum-utils.ts to keep enums.ts focused on definitions
export { assertNever, isValidEnumValue, parseEnum } from './enum-utils'
