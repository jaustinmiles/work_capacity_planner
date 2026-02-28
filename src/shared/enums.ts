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

// User task type kind (for distinguishing system vs user-created types)
export enum UserTaskTypeKind {
  System = 'system',
  User = 'user',
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

// Work block types for scheduling - non-work time only
// Task types are now user-defined, not hardcoded
export enum WorkBlockType {
  Blocked = 'blocked',
  Sleep = 'sleep',
}

// Block configuration kinds - how a work block handles task types
export enum BlockConfigKind {
  Single = 'single',  // Block accepts only one specific task type
  Combo = 'combo',    // Block accepts multiple types with ratio-based capacity allocation
  System = 'system',  // Non-working block (blocked or sleep)
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
  TaskTypeCreation = 'task_type_creation',
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

// Split cursor mode for work session editing
export enum SplitMode {
  Inactive = 'inactive',
  Hovering = 'hovering',
  Frozen = 'frozen',
}

// Work Logger layout modes for ultra-wide screens
export enum WorkLoggerLayoutMode {
  Stacked = 'stacked',           // Default: components stacked vertically
  SideBySide = 'side-by-side',   // Clock + LinearTimeline horizontal
  ClockSidebar = 'clock-sidebar', // Clock as sticky sidebar, timelines get full width
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

// Amendment status tracking (for processing outcomes)
export enum AmendmentStatus {
  Pending = 'pending',
  Applied = 'applied',
  Rejected = 'rejected',
  Error = 'error',
}

// Amendment card status (for UI card states)
export enum AmendmentCardStatus {
  Pending = 'pending',
  Applied = 'applied',
  Skipped = 'skipped',
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

// Meeting/event types for work schedule (recurring events in daily patterns)
export enum MeetingType {
  Meeting = 'meeting',
  Break = 'break',
  Personal = 'personal',
  Blocked = 'blocked',
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
  Sprint = 'sprint',
  Endeavors = 'endeavors',
  DeepWork = 'deepWork',
}

// Sprint filter modes for task list views
export enum SprintFilterMode {
  All = 'all', // Show all tasks (default)
  SprintOnly = 'sprint', // Show only inActiveSprint=true
  BacklogOnly = 'backlog', // Show only inActiveSprint=false
}

// Endeavor status - tracks lifecycle of higher-level goals
export enum EndeavorStatus {
  Active = 'active',       // Currently being worked on
  Completed = 'completed', // All tasks/workflows complete
  Paused = 'paused',       // Temporarily on hold
  Archived = 'archived',   // No longer active, kept for history
}

// AI Processing modes for brainstorming
export enum AIProcessingMode {
  Tasks = 'tasks',
  Workflows = 'workflows',
}

// Preview display modes for amendment components
export enum PreviewMode {
  Compact = 'compact',    // Truncated view for modals
  Detailed = 'detailed',  // Full view with all steps and dependencies
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

// Scroll behavior for chat and UI scrolling
export enum ScrollBehavior {
  Smooth = 'smooth',
  Instant = 'instant',
  Auto = 'auto',
}

// Animation playback state for radar chart time-lapse
export enum AnimationPlayState {
  Stopped = 'stopped',
  Playing = 'playing',
  Paused = 'paused',
}

// Animation direction for bounce (ping-pong) mode
export enum AnimationDirection {
  Forward = 'forward',
  Backward = 'backward',
}

// Animation speed presets (frames per second multiplier)
// Base interval is 1000ms, so Normal = 1 frame/second
export enum AnimationSpeed {
  Slow = 0.5,      // 2 seconds per frame
  Normal = 1,      // 1 second per frame
  Fast = 2,        // 0.5 seconds per frame
  VeryFast = 4,    // 0.25 seconds per frame
}

// Graph node ID prefixes (used to construct/parse ReactFlow node IDs)
export enum GraphNodePrefix {
  Endeavor = 'endeavor',
  Step = 'step',
  Task = 'task',
  Goal = 'goal',
  DeepWorkTask = 'dwt',
  DeepWorkStep = 'dws',
}

// Graph edge ID prefixes
export enum GraphEdgePrefix {
  Internal = 'edge',
  Dependency = 'dep',
}

// ReactFlow custom node type identifiers
export enum GraphNodeType {
  EndeavorRegion = 'endeavorRegion',
  TaskStep = 'taskStep',
  Goal = 'goal',
  DeepWorkTask = 'deepWorkTask',
  DeepWorkStep = 'deepWorkStep',
}

// ReactFlow edge type identifiers
export enum GraphEdgeType {
  SmoothStep = 'smoothstep',
  Dependency = 'dependency',
  DeepWorkDependency = 'deepWorkDependency',
}

// Re-export enum utility functions from enum-utils.ts for backwards compatibility
// These functions are now defined in enum-utils.ts to keep enums.ts focused on definitions
export { assertNever, isValidEnumValue, parseEnum } from './enum-utils'
