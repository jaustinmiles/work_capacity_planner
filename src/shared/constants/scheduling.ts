/**
 * Scheduling-related constants
 * All timing, debounce, and scheduling configuration values
 */

export const SCHEDULING_CONSTANTS = {
  // Debounce delays
  TASK_STORE_DEBOUNCE_MS: 16, // One animation frame (~60fps) for faster reactivity
  AUTO_CONNECT_DELAY_MS: 100, // Delay for auto-connecting stores on load

  // Polling intervals
  WAIT_TIME_CHECK_INTERVAL_MS: 1000, // Check wait times every second

  // Scheduling limits
  MAX_DAYS_TO_SCHEDULE: 30, // Maximum days to look ahead when scheduling
  DEFAULT_SPLIT_RATIO: 0.5, // Default split for mixed tasks (50/50)
} as const

export type SchedulingConstants = typeof SCHEDULING_CONSTANTS
