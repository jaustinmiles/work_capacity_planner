/**
 * Tests for TimeProvider - the global time control system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { timeProvider } from '../time-provider'

describe('TimeProvider', () => {
  beforeEach(() => {
    // Clear any overrides before each test
    timeProvider.setOverride(null)
  })

  describe('Basic functionality', () => {
    it('should return current time when no override is set', () => {
      const now = new Date()
      const providerTime = timeProvider.now()

      // Times should be very close (within 100ms)
      expect(Math.abs(providerTime.getTime() - now.getTime())).toBeLessThan(100)
    })

    it('should return current time in milliseconds', () => {
      const nowMs = Date.now()
      const providerMs = timeProvider.nowMs()

      // Times should be very close (within 100ms)
      expect(Math.abs(providerMs - nowMs)).toBeLessThan(100)
    })

    it('should return false for isOverridden when no override is set', () => {
      expect(timeProvider.isOverridden()).toBe(false)
    })

    it('should return null for getOverride when no override is set', () => {
      expect(timeProvider.getOverride()).toBeNull()
    })
  })

  describe('Override functionality', () => {
    it('should set override from Date object', () => {
      const testDate = new Date('2025-08-29T20:00:00')
      timeProvider.setOverride(testDate)

      expect(timeProvider.isOverridden()).toBe(true)
      expect(timeProvider.getOverride()?.toISOString()).toBe(testDate.toISOString())
      expect(timeProvider.now().toISOString()).toBe(testDate.toISOString())
    })

    it('should set override from ISO string', () => {
      const testDateStr = '2025-08-29T20:00:00.000Z'
      timeProvider.setOverride(testDateStr)

      expect(timeProvider.isOverridden()).toBe(true)
      expect(timeProvider.now().toISOString()).toBe(testDateStr)
    })

    it('should clear override when null is passed', () => {
      const testDate = new Date('2025-08-29T20:00:00')
      timeProvider.setOverride(testDate)
      expect(timeProvider.isOverridden()).toBe(true)

      timeProvider.setOverride(null)
      expect(timeProvider.isOverridden()).toBe(false)
      expect(timeProvider.getOverride()).toBeNull()
    })

    it('should return overridden time in milliseconds', () => {
      const testDate = new Date('2025-08-29T20:00:00')
      timeProvider.setOverride(testDate)

      expect(timeProvider.nowMs()).toBe(testDate.getTime())
    })
  })

  describe('Time manipulation', () => {
    it('should advance time by specified minutes', () => {
      const testDate = new Date('2025-08-29T20:00:00')
      timeProvider.setOverride(testDate)

      timeProvider.advanceBy(30)

      const expectedTime = new Date('2025-08-29T20:30:00')
      expect(timeProvider.now().toISOString()).toBe(expectedTime.toISOString())
    })

    it('should not advance when no override is set', () => {
      // advanceBy requires an override to be set first
      expect(timeProvider.isOverridden()).toBe(false)

      timeProvider.advanceBy(60)

      // Should still not be overridden
      expect(timeProvider.isOverridden()).toBe(false)
    })

    it('should set time to specific hour and minute today', () => {
      timeProvider.setTimeToday(14, 30)

      const result = timeProvider.now()
      expect(result.getHours()).toBe(14)
      expect(result.getMinutes()).toBe(30)
      expect(result.getSeconds()).toBe(0)
      expect(result.getMilliseconds()).toBe(0)
    })

    it('should set time with default minutes of 0', () => {
      timeProvider.setTimeToday(9)

      const result = timeProvider.now()
      expect(result.getHours()).toBe(9)
      expect(result.getMinutes()).toBe(0)
    })
  })

  describe('Subscription functionality', () => {
    it('should notify listeners when override changes', () => {
      const listener = vi.fn()
      const unsubscribe = timeProvider.subscribe(listener)

      const testDate = new Date('2025-08-29T20:00:00')
      timeProvider.setOverride(testDate)

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(testDate)

      unsubscribe()
    })

    it('should notify listeners when override is cleared', () => {
      const listener = vi.fn()
      timeProvider.setOverride(new Date('2025-08-29T20:00:00'))

      const unsubscribe = timeProvider.subscribe(listener)
      timeProvider.setOverride(null)

      expect(listener).toHaveBeenCalledTimes(1)
      // When cleared, it should pass the current real time
      expect(listener.mock.calls[0][0]).toBeInstanceOf(Date)

      unsubscribe()
    })

    it('should not notify after unsubscribe', () => {
      const listener = vi.fn()
      const unsubscribe = timeProvider.subscribe(listener)

      timeProvider.setOverride(new Date('2025-08-29T20:00:00'))
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()

      timeProvider.setOverride(new Date('2025-08-30T20:00:00'))
      expect(listener).toHaveBeenCalledTimes(1) // Still 1, not 2
    })

    it('should handle multiple listeners', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      const unsub1 = timeProvider.subscribe(listener1)
      const unsub2 = timeProvider.subscribe(listener2)

      const testDate = new Date('2025-08-29T20:00:00')
      timeProvider.setOverride(testDate)

      expect(listener1).toHaveBeenCalledWith(testDate)
      expect(listener2).toHaveBeenCalledWith(testDate)

      unsub1()
      unsub2()
    })
  })

  describe('Edge cases', () => {
    it('should handle invalid date strings gracefully', () => {
      // Invalid date strings create an Invalid Date object
      timeProvider.setOverride('invalid-date')

      // It will still be overridden, but with an invalid date
      expect(timeProvider.isOverridden()).toBe(true)
      const override = timeProvider.getOverride()
      expect(override).toBeInstanceOf(Date)
      expect(isNaN(override!.getTime())).toBe(true) // Invalid date
    })

    it('should create new Date objects to prevent mutations', () => {
      const testDate = new Date('2025-08-29T20:00:00')
      timeProvider.setOverride(testDate)

      const time1 = timeProvider.now()
      const time2 = timeProvider.now()

      expect(time1).not.toBe(time2) // Different objects
      expect(time1.toISOString()).toBe(time2.toISOString()) // Same time
    })

    it('should handle advancing by negative minutes', () => {
      const testDate = new Date('2025-08-29T20:00:00')
      timeProvider.setOverride(testDate)

      timeProvider.advanceBy(-30)

      const expectedTime = new Date('2025-08-29T19:30:00')
      expect(timeProvider.now().toISOString()).toBe(expectedTime.toISOString())
    })

    it('should handle setting time to invalid hours/minutes', () => {
      // Should not throw
      expect(() => {
        timeProvider.setTimeToday(25, 70) // Invalid hour and minute
      }).not.toThrow()

      // JavaScript Date will wrap around
      const result = timeProvider.now()
      expect(result).toBeInstanceOf(Date)
    })
  })
})
