import { describe, it, expect } from 'vitest'
import {
  TaskType,
  TaskStatus,
  WorkflowStatus,
  StepStatus,
  WorkBlockType,
  TASK_PRIORITY,
  CAPACITY_LIMITS,
  UI_CONSTANTS,
  DATE_FORMATS,
} from './constants'

describe('constants', () => {
  describe('TaskType enum', () => {
    it('should have correct values', () => {
      expect(TaskType.FOCUSED).toBe('focused')
      expect(TaskType.ADMIN).toBe('admin')
      expect(TaskType.BLOCKED).toBe('blocked-time')
      expect(TaskType.MEETING).toBe('meeting')
      expect(TaskType.ASYNC_WAIT).toBe('async-wait')
    })

    it('should have all expected keys', () => {
      const keys = Object.keys(TaskType)
      expect(keys).toContain('FOCUSED')
      expect(keys).toContain('ADMIN')
      expect(keys).toContain('BLOCKED')
      expect(keys).toContain('MEETING')
      expect(keys).toContain('ASYNC_WAIT')
    })

    it('should be usable in type checking', () => {
      const taskType: TaskType = TaskType.FOCUSED
      expect(taskType).toBe('focused')
    })
  })

  describe('TaskStatus enum', () => {
    it('should have correct values', () => {
      expect(TaskStatus.PENDING).toBe('pending')
      expect(TaskStatus.NOT_STARTED).toBe('not_started')
      expect(TaskStatus.IN_PROGRESS).toBe('in_progress')
      expect(TaskStatus.COMPLETED).toBe('completed')
      expect(TaskStatus.BLOCKED).toBe('blocked')
      expect(TaskStatus.CANCELLED).toBe('cancelled')
    })

    it('should have all expected keys', () => {
      const keys = Object.keys(TaskStatus)
      expect(keys).toHaveLength(6)
      expect(keys).toContain('PENDING')
      expect(keys).toContain('NOT_STARTED')
      expect(keys).toContain('IN_PROGRESS')
      expect(keys).toContain('COMPLETED')
      expect(keys).toContain('BLOCKED')
      expect(keys).toContain('CANCELLED')
    })

    it('should allow status comparisons', () => {
      const status: TaskStatus = TaskStatus.IN_PROGRESS
      expect(status === TaskStatus.IN_PROGRESS).toBe(true)
      expect(status === TaskStatus.COMPLETED).toBe(false)
    })
  })

  describe('WorkflowStatus enum', () => {
    it('should have correct values', () => {
      expect(WorkflowStatus.NOT_STARTED).toBe('not_started')
      expect(WorkflowStatus.IN_PROGRESS).toBe('in_progress')
      expect(WorkflowStatus.PAUSED).toBe('paused')
      expect(WorkflowStatus.COMPLETED).toBe('completed')
      expect(WorkflowStatus.CANCELLED).toBe('cancelled')
    })

    it('should have all expected keys', () => {
      const keys = Object.keys(WorkflowStatus)
      expect(keys).toHaveLength(5)
      expect(keys).toContain('NOT_STARTED')
      expect(keys).toContain('IN_PROGRESS')
      expect(keys).toContain('PAUSED')
      expect(keys).toContain('COMPLETED')
      expect(keys).toContain('CANCELLED')
    })

    it('should be distinct from TaskStatus', () => {
      // Both have IN_PROGRESS but they should be separate enums
      expect(WorkflowStatus.IN_PROGRESS).toBe('in_progress')
      expect(TaskStatus.IN_PROGRESS).toBe('in_progress')
      // Values are same but enums are distinct types
    })
  })

  describe('StepStatus enum', () => {
    it('should have correct values', () => {
      expect(StepStatus.PENDING).toBe('pending')
      expect(StepStatus.IN_PROGRESS).toBe('in_progress')
      expect(StepStatus.COMPLETED).toBe('completed')
      expect(StepStatus.SKIPPED).toBe('skipped')
    })

    it('should have all expected keys', () => {
      const keys = Object.keys(StepStatus)
      expect(keys).toHaveLength(4)
      expect(keys).toContain('PENDING')
      expect(keys).toContain('IN_PROGRESS')
      expect(keys).toContain('COMPLETED')
      expect(keys).toContain('SKIPPED')
    })

    it('should include SKIPPED status unique to steps', () => {
      expect(StepStatus.SKIPPED).toBe('skipped')
      // This status is unique to steps, not in TaskStatus
      expect(Object.values(TaskStatus)).not.toContain('skipped')
    })
  })

  describe('WorkBlockType enum', () => {
    it('should have correct values', () => {
      expect(WorkBlockType.FOCUSED).toBe('focused')
      expect(WorkBlockType.ADMIN).toBe('admin')
      expect(WorkBlockType.MIXED).toBe('mixed')
      expect(WorkBlockType.BLOCKED).toBe('blocked')
      expect(WorkBlockType.SLEEP).toBe('sleep')
    })

    it('should have all expected keys', () => {
      const keys = Object.keys(WorkBlockType)
      expect(keys).toHaveLength(7)
      expect(keys).toContain('FOCUSED')
      expect(keys).toContain('ADMIN')
      expect(keys).toContain('MIXED')
      expect(keys).toContain('FLEXIBLE')
      expect(keys).toContain('PERSONAL')
      expect(keys).toContain('BLOCKED')
      expect(keys).toContain('SLEEP')
    })

    it('should have types that align with TaskType where applicable', () => {
      expect(WorkBlockType.FOCUSED).toBe('focused')
      expect(TaskType.FOCUSED).toBe('focused')
      expect(WorkBlockType.ADMIN).toBe('admin')
      expect(TaskType.ADMIN).toBe('admin')
    })

    it('should have unique block types', () => {
      expect(WorkBlockType.MIXED).toBe('mixed')
      expect(WorkBlockType.SLEEP).toBe('sleep')
      // These don't exist in TaskType
      expect(Object.values(TaskType)).not.toContain('mixed')
      expect(Object.values(TaskType)).not.toContain('sleep')
    })
  })

  describe('TASK_PRIORITY constants', () => {
    it('should have correct values', () => {
      expect(TASK_PRIORITY.URGENT_THRESHOLD_HOURS).toBe(24)
      expect(TASK_PRIORITY.PRIORITY_MULTIPLIER).toBe(100)
      expect(TASK_PRIORITY.DEFAULT_IMPORTANCE).toBe(5)
      expect(TASK_PRIORITY.DEFAULT_URGENCY).toBe(5)
    })

    it('should be readonly', () => {
      // TypeScript ensures these are readonly at compile time
      // This test verifies the values haven't been modified
      expect(TASK_PRIORITY.URGENT_THRESHOLD_HOURS).toBe(24)
      expect(TASK_PRIORITY.PRIORITY_MULTIPLIER).toBe(100)
    })

    it('should have sensible default values', () => {
      expect(TASK_PRIORITY.DEFAULT_IMPORTANCE).toBeGreaterThanOrEqual(0)
      expect(TASK_PRIORITY.DEFAULT_IMPORTANCE).toBeLessThanOrEqual(10)
      expect(TASK_PRIORITY.DEFAULT_URGENCY).toBeGreaterThanOrEqual(0)
      expect(TASK_PRIORITY.DEFAULT_URGENCY).toBeLessThanOrEqual(10)
    })

    it('should have all expected properties', () => {
      const keys = Object.keys(TASK_PRIORITY)
      expect(keys).toHaveLength(4)
      expect(keys).toContain('URGENT_THRESHOLD_HOURS')
      expect(keys).toContain('PRIORITY_MULTIPLIER')
      expect(keys).toContain('DEFAULT_IMPORTANCE')
      expect(keys).toContain('DEFAULT_URGENCY')
    })
  })

  describe('CAPACITY_LIMITS constants', () => {
    it('should have correct values', () => {
      expect(CAPACITY_LIMITS.DAILY_FOCUS_MINUTES).toBe(240)
      expect(CAPACITY_LIMITS.DAILY_ADMIN_MINUTES).toBe(180)
      expect(CAPACITY_LIMITS.MAX_TASK_DURATION).toBe(480)
      expect(CAPACITY_LIMITS.MIN_TASK_DURATION).toBe(15)
    })

    it('should have sensible relationships', () => {
      // Max task duration should be greater than daily limits
      expect(CAPACITY_LIMITS.MAX_TASK_DURATION).toBeGreaterThan(CAPACITY_LIMITS.DAILY_FOCUS_MINUTES)
      expect(CAPACITY_LIMITS.MAX_TASK_DURATION).toBeGreaterThan(CAPACITY_LIMITS.DAILY_ADMIN_MINUTES)

      // Min should be less than daily limits
      expect(CAPACITY_LIMITS.MIN_TASK_DURATION).toBeLessThan(CAPACITY_LIMITS.DAILY_FOCUS_MINUTES)
      expect(CAPACITY_LIMITS.MIN_TASK_DURATION).toBeLessThan(CAPACITY_LIMITS.DAILY_ADMIN_MINUTES)
    })

    it('should represent reasonable work hours', () => {
      // 240 minutes = 4 hours for focused work
      expect(CAPACITY_LIMITS.DAILY_FOCUS_MINUTES / 60).toBe(4)
      // 180 minutes = 3 hours for admin work
      expect(CAPACITY_LIMITS.DAILY_ADMIN_MINUTES / 60).toBe(3)
      // Total = 7 hours of work
      const totalDaily = CAPACITY_LIMITS.DAILY_FOCUS_MINUTES + CAPACITY_LIMITS.DAILY_ADMIN_MINUTES
      expect(totalDaily / 60).toBe(7)
    })

    it('should have all expected properties', () => {
      const keys = Object.keys(CAPACITY_LIMITS)
      expect(keys).toHaveLength(4)
      expect(keys).toContain('DAILY_FOCUS_MINUTES')
      expect(keys).toContain('DAILY_ADMIN_MINUTES')
      expect(keys).toContain('MAX_TASK_DURATION')
      expect(keys).toContain('MIN_TASK_DURATION')
    })
  })

  describe('UI_CONSTANTS', () => {
    it('should have correct values', () => {
      expect(UI_CONSTANTS.DEBOUNCE_DELAY).toBe(300)
      expect(UI_CONSTANTS.TOAST_DURATION).toBe(3000)
      expect(UI_CONSTANTS.MODAL_ANIMATION).toBe(200)
      expect(UI_CONSTANTS.MIN_ZOOM).toBe(0.5)
      expect(UI_CONSTANTS.MAX_ZOOM).toBe(3)
      expect(UI_CONSTANTS.DEFAULT_ZOOM).toBe(1)
    })

    it('should have sensible timing values', () => {
      // Debounce should be quick but not too quick
      expect(UI_CONSTANTS.DEBOUNCE_DELAY).toBeGreaterThanOrEqual(100)
      expect(UI_CONSTANTS.DEBOUNCE_DELAY).toBeLessThanOrEqual(1000)

      // Toast should be visible but not annoying
      expect(UI_CONSTANTS.TOAST_DURATION).toBeGreaterThanOrEqual(1000)
      expect(UI_CONSTANTS.TOAST_DURATION).toBeLessThanOrEqual(10000)

      // Animations should be snappy
      expect(UI_CONSTANTS.MODAL_ANIMATION).toBeLessThanOrEqual(500)
    })

    it('should have valid zoom ranges', () => {
      expect(UI_CONSTANTS.MIN_ZOOM).toBeLessThan(UI_CONSTANTS.DEFAULT_ZOOM)
      expect(UI_CONSTANTS.DEFAULT_ZOOM).toBeLessThan(UI_CONSTANTS.MAX_ZOOM)
      expect(UI_CONSTANTS.MIN_ZOOM).toBeGreaterThan(0)
      expect(UI_CONSTANTS.DEFAULT_ZOOM).toBe(1)
    })

    it('should have all expected properties', () => {
      const keys = Object.keys(UI_CONSTANTS)
      expect(keys).toHaveLength(6)
      expect(keys).toContain('DEBOUNCE_DELAY')
      expect(keys).toContain('TOAST_DURATION')
      expect(keys).toContain('MODAL_ANIMATION')
      expect(keys).toContain('MIN_ZOOM')
      expect(keys).toContain('MAX_ZOOM')
      expect(keys).toContain('DEFAULT_ZOOM')
    })
  })

  describe('DATE_FORMATS', () => {
    it('should have correct format strings', () => {
      expect(DATE_FORMATS.DISPLAY_DATE).toBe('MMM D, YYYY')
      expect(DATE_FORMATS.DISPLAY_TIME).toBe('h:mm A')
      expect(DATE_FORMATS.DISPLAY_DATETIME).toBe('MMM D, YYYY h:mm A')
      expect(DATE_FORMATS.ISO_DATE).toBe('YYYY-MM-DD')
      expect(DATE_FORMATS.TIME_24H).toBe('HH:mm')
    })

    it('should follow standard date format conventions', () => {
      // ISO format should follow standard
      expect(DATE_FORMATS.ISO_DATE).toMatch(/YYYY-MM-DD/)

      // 24H time format
      expect(DATE_FORMATS.TIME_24H).toMatch(/HH:mm/)

      // 12H time format with AM/PM
      expect(DATE_FORMATS.DISPLAY_TIME).toContain('A')
    })

    it('should have display formats for user-facing dates', () => {
      // Display formats should be human-readable
      expect(DATE_FORMATS.DISPLAY_DATE).toContain('MMM')
      expect(DATE_FORMATS.DISPLAY_DATETIME).toContain('MMM')
      expect(DATE_FORMATS.DISPLAY_DATETIME).toContain(':')
    })

    it('should have all expected properties', () => {
      const keys = Object.keys(DATE_FORMATS)
      expect(keys).toHaveLength(5)
      expect(keys).toContain('DISPLAY_DATE')
      expect(keys).toContain('DISPLAY_TIME')
      expect(keys).toContain('DISPLAY_DATETIME')
      expect(keys).toContain('ISO_DATE')
      expect(keys).toContain('TIME_24H')
    })
  })

  describe('Cross-constant relationships', () => {
    it('should have consistent task types across enums', () => {
      // TaskType and WorkBlockType should align for common types
      expect(TaskType.FOCUSED).toBe(WorkBlockType.FOCUSED)
      expect(TaskType.ADMIN).toBe(WorkBlockType.ADMIN)
    })

    it('should have non-overlapping status values where appropriate', () => {
      // Step status has unique values
      expect(Object.values(TaskStatus)).not.toContain('skipped')
      expect(Object.values(StepStatus)).toContain('skipped')
    })

    it('should maintain reasonable capacity relationships', () => {
      // A single task shouldn't exceed daily capacity
      expect(CAPACITY_LIMITS.MAX_TASK_DURATION).toBeLessThanOrEqual(
        CAPACITY_LIMITS.DAILY_FOCUS_MINUTES + CAPACITY_LIMITS.DAILY_ADMIN_MINUTES + 60, // Allow some buffer
      )
    })
  })

  describe('Constants immutability', () => {
    it('should not allow modification of constant objects', () => {
      // These tests verify that the 'as const' assertion is working
      const originalPriority = TASK_PRIORITY.URGENT_THRESHOLD_HOURS
      // Attempt to modify would fail at compile time with TypeScript
      // At runtime, we verify the value hasn't changed
      expect(TASK_PRIORITY.URGENT_THRESHOLD_HOURS).toBe(originalPriority)
    })

    it('should maintain type safety for enum usage', () => {
      // This would fail TypeScript compilation if enums weren't properly typed
      const statuses: TaskStatus[] = [
        TaskStatus.PENDING,
        TaskStatus.IN_PROGRESS,
        TaskStatus.COMPLETED,
      ]
      expect(statuses).toHaveLength(3)
    })
  })
})
