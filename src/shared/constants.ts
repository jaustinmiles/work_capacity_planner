/**
 * Shared constants used throughout the application
 *
 * Note: Enums have been moved to shared/enums.ts for consistency.
 * This file now contains only non-enum constants.
 */

export enum ComparisonType {
  Priority = 'priority',
  Urgency = 'urgency',
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

export const RESPONSIVE_BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
  uwqhd: 2560,
  suw: 3440,
} as const

export const ULTRA_WIDE_DEFAULTS = {
  // SwimLaneTimeline
  SWIM_LANE_DAY_COUNT_UWQHD: 5,
  SWIM_LANE_DAY_COUNT_SUW: 7,
  SWIM_LANE_HOUR_WIDTH_UWQHD: 100,
  SWIM_LANE_HOUR_WIDTH_SUW: 120,

  // LinearTimeline
  LINEAR_ZOOM_UWQHD: 100,
  LINEAR_ZOOM_SUW: 140,

  // GanttChart
  GANTT_ZOOM_UWQHD: 150,
  GANTT_ZOOM_SUW: 180,
  GANTT_ROW_LABEL_WIDTH_UWQHD: 220,
  GANTT_ROW_LABEL_WIDTH_SUW: 280,

  // CircularClock sidebar mode
  CLOCK_SIDEBAR_WIDTH: 400,
  CLOCK_SIDEBAR_WIDTH_UWQHD: 500,
  CLOCK_SIDEBAR_WIDTH_SUW: 550,
  CLOCK_MAX_SIZE_UWQHD: 500,
  CLOCK_MAX_SIZE_SUW: 550,
} as const
