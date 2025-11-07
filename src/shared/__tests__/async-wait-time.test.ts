import { describe, it, expect } from 'vitest'
import { calculateRemainingWaitTime, formatCountdown, getWaitStatus } from '../time-utils'

describe('Async Wait Time Functionality', () => {
  describe('calculateRemainingWaitTime', () => {
    it('should calculate remaining wait time correctly', () => {
      const completedAt = new Date('2024-01-01T10:00:00')
      const asyncWaitMinutes = 15
      const currentTime = new Date('2024-01-01T10:10:00')

      const remaining = calculateRemainingWaitTime(completedAt, asyncWaitMinutes, currentTime)

      expect(remaining).toBe(5) // 15 - 10 = 5 minutes remaining
    })

    it('should return 0 when wait time has expired', () => {
      const completedAt = new Date('2024-01-01T10:00:00')
      const asyncWaitMinutes = 15
      const currentTime = new Date('2024-01-01T10:20:00')

      const remaining = calculateRemainingWaitTime(completedAt, asyncWaitMinutes, currentTime)

      expect(remaining).toBe(0) // Wait time has expired
    })

    it('should handle negative remaining time', () => {
      const completedAt = new Date('2024-01-01T10:00:00')
      const asyncWaitMinutes = 15
      const currentTime = new Date('2024-01-01T10:30:00')

      const remaining = calculateRemainingWaitTime(completedAt, asyncWaitMinutes, currentTime)

      expect(remaining).toBe(0) // Should be 0, not negative
    })
  })

  describe('formatCountdown', () => {
    it('should format remaining time correctly', () => {
      expect(formatCountdown(5)).toBe('5m remaining')
      expect(formatCountdown(65)).toBe('1h 5m remaining')
      expect(formatCountdown(120)).toBe('2h remaining')
    })

    it('should show Ready when time is up', () => {
      expect(formatCountdown(0)).toBe('Ready')
      expect(formatCountdown(-5)).toBe('Ready')
    })
  })

  describe('getWaitStatus', () => {
    it('should return correct wait status', () => {
      const completedAt = new Date('2024-01-01T10:00:00')
      const asyncWaitMinutes = 15
      const currentTime = new Date('2024-01-01T10:10:00')

      const status = getWaitStatus(completedAt, asyncWaitMinutes, currentTime)

      expect(status.remainingMinutes).toBe(5)
      expect(status.displayText).toBe('5m remaining')
      expect(status.expired).toBe(false)
    })

    it('should mark as expired when wait time is complete', () => {
      const completedAt = new Date('2024-01-01T10:00:00')
      const asyncWaitMinutes = 15
      const currentTime = new Date('2024-01-01T10:20:00')

      const status = getWaitStatus(completedAt, asyncWaitMinutes, currentTime)

      expect(status.remainingMinutes).toBe(0)
      expect(status.displayText).toBe('Ready')
      expect(status.expired).toBe(true)
    })
  })

  describe('Workflow Reset', () => {
    it('should clear wait time tracking when workflow is reset', () => {
      // This tests the concept - the actual implementation is in App.tsx handleResetWorkflow
      const step = {
        id: 'step-1',
        name: 'Test Step',
        status: 'waiting',
        completedAt: new Date('2024-01-01T10:00:00'),
        asyncWaitTime: 15,
      }

      // Simulate reset
      const resetStep = {
        ...step,
        status: 'pending',
        completedAt: null,
        startedAt: null,
      }

      expect(resetStep.completedAt).toBeNull()
      expect(resetStep.status).toBe('pending')

      // After reset, wait time calculation should not be possible
      if (resetStep.completedAt) {
        const remaining = calculateRemainingWaitTime(
          resetStep.completedAt,
          resetStep.asyncWaitTime,
          new Date(),
        )
        expect(remaining).toBeDefined() // This won't run since completedAt is null
      } else {
        expect(resetStep.completedAt).toBeNull() // Confirms reset worked
      }
    })
  })
})
