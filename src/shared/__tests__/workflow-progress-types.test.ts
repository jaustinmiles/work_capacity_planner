import { describe, it, expect } from 'vitest'
import {
  isCompletedStep,
  isActiveWorkSession,
  hasTimeVariance,
  TIME_ESTIMATION_THRESHOLDS,
  WORKFLOW_STATUS_THRESHOLDS,
} from '../workflow-progress-types'
import { UnifiedWorkSession } from '../unified-work-session-types'

describe('workflow-progress-types', () => {
  describe('isCompletedStep', () => {
    it('should return true for completed status', () => {
      expect(isCompletedStep({ status: 'completed' })).toBe(true)
    })

    it('should return false for pending status', () => {
      expect(isCompletedStep({ status: 'pending' })).toBe(false)
    })

    it('should return false for in_progress status', () => {
      expect(isCompletedStep({ status: 'in_progress' })).toBe(false)
    })

    it('should return false for skipped status', () => {
      expect(isCompletedStep({ status: 'skipped' })).toBe(false)
    })
  })

  describe('isActiveWorkSession', () => {
    it('should return true when session has no endTime', () => {
      const session = {
        id: 'ws-1',
        taskId: 'task-1',
        stepId: null,
        startTime: new Date(),
        endTime: null,
        actualMinutes: null,
        notes: null,
        isPaused: false,
        pausedAt: null,
        accumulatedMinutes: 0,
      } as UnifiedWorkSession

      expect(isActiveWorkSession(session)).toBe(true)
    })

    it('should return false when session has endTime', () => {
      const session = {
        id: 'ws-1',
        taskId: 'task-1',
        stepId: null,
        startTime: new Date(),
        endTime: new Date(),
        actualMinutes: 30,
        notes: null,
        isPaused: false,
        pausedAt: null,
        accumulatedMinutes: 0,
      } as UnifiedWorkSession

      expect(isActiveWorkSession(session)).toBe(false)
    })
  })

  describe('hasTimeVariance', () => {
    it('should return false when actual equals estimated', () => {
      expect(hasTimeVariance(60, 60)).toBe(false)
    })

    it('should return false for variance within default threshold (10%)', () => {
      expect(hasTimeVariance(100, 105)).toBe(false) // 5% variance
      expect(hasTimeVariance(100, 95)).toBe(false) // 5% variance
    })

    it('should return true for variance exceeding default threshold', () => {
      expect(hasTimeVariance(100, 115)).toBe(true) // 15% variance
      expect(hasTimeVariance(100, 85)).toBe(true) // 15% variance
    })

    it('should use custom threshold when provided', () => {
      // With 25% threshold, 20% variance should be within
      expect(hasTimeVariance(100, 120, 0.25)).toBe(false)
      // With 25% threshold, 30% variance should exceed
      expect(hasTimeVariance(100, 130, 0.25)).toBe(true)
    })

    it('should handle edge case at exact threshold', () => {
      // 10% variance with 10% threshold should return false (not > threshold)
      expect(hasTimeVariance(100, 110, 0.1)).toBe(false)
    })

    it('should handle underestimation', () => {
      expect(hasTimeVariance(100, 70)).toBe(true) // 30% under
    })
  })

  describe('Constants', () => {
    it('should have correct TIME_ESTIMATION_THRESHOLDS', () => {
      expect(TIME_ESTIMATION_THRESHOLDS.ACCURATE).toBe(0.1)
      expect(TIME_ESTIMATION_THRESHOLDS.MODERATE).toBe(0.25)
      expect(TIME_ESTIMATION_THRESHOLDS.POOR).toBe(0.5)
    })

    it('should have correct WORKFLOW_STATUS_THRESHOLDS', () => {
      expect(WORKFLOW_STATUS_THRESHOLDS.DELAYED).toBe(1.2)
      expect(WORKFLOW_STATUS_THRESHOLDS.AT_RISK).toBe(1.1)
      expect(WORKFLOW_STATUS_THRESHOLDS.ON_TRACK).toBe(1.0)
    })
  })
})
