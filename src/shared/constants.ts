/**
 * Shared constants and enums used throughout the application
 */

export enum TaskType {
  FOCUSED = 'focused',
  ADMIN = 'admin',
  BLOCKED = 'blocked-time',
  MEETING = 'meeting',
  ASYNC_WAIT = 'async-wait',
}

export enum TaskStatus {
  PENDING = 'pending',
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled',
}

export enum WorkflowStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum StepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export enum WorkBlockType {
  FOCUSED = 'focused',
  ADMIN = 'admin',
  MIXED = 'mixed',
  BLOCKED = 'blocked',
  SLEEP = 'sleep',
}

export const TASK_PRIORITY = {
  URGENT_THRESHOLD_HOURS: 24, // Tasks due within 24 hours get priority boost
  PRIORITY_MULTIPLIER: 100,   // Boost factor for urgent tasks
  DEFAULT_IMPORTANCE: 5,
  DEFAULT_URGENCY: 5,
} as const

export const CAPACITY_LIMITS = {
  DAILY_FOCUS_MINUTES: 240,  // 4 hours
  DAILY_ADMIN_MINUTES: 180,  // 3 hours
  MAX_TASK_DURATION: 480,    // 8 hours
  MIN_TASK_DURATION: 15,     // 15 minutes
} as const

export const UI_CONSTANTS = {
  DEBOUNCE_DELAY: 300,       // ms for search/filter debounce
  TOAST_DURATION: 3000,      // ms for toast notifications
  MODAL_ANIMATION: 200,      // ms for modal animations
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 3,
  DEFAULT_ZOOM: 1,
} as const

export const DATE_FORMATS = {
  DISPLAY_DATE: 'MMM D, YYYY',
  DISPLAY_TIME: 'h:mm A',
  DISPLAY_DATETIME: 'MMM D, YYYY h:mm A',
  ISO_DATE: 'YYYY-MM-DD',
  TIME_24H: 'HH:mm',
} as const