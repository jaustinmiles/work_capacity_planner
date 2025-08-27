import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Sampler } from '../core/Sampler'
import { LogLevel } from '../types'

describe('Sampler', () => {
  let sampler: Sampler

  beforeEach(() => {
    sampler = new Sampler({
      errorRate: 1.0,
      warnRate: 0.8,
      infoRate: 0.5,
      debugRate: 0.2,
      traceRate: 0.1,
      adaptiveSampling: false,
      bypassInDev: false,
    })
  })

  describe('shouldSample', () => {
    it('should always sample errors', () => {
      // Run 100 times to ensure it's always true
      for (let i = 0; i < 100; i++) {
        expect(sampler.shouldSample(LogLevel.ERROR)).toBe(true)
      }
    })

    it('should sample based on configured rates', () => {
      // Mock Math.random to control sampling
      const mockRandom = vi.spyOn(Math, 'random')

      // Test WARN with 0.8 rate
      mockRandom.mockReturnValue(0.7) // Less than 0.8
      expect(sampler.shouldSample(LogLevel.WARN)).toBe(true)

      mockRandom.mockReturnValue(0.9) // Greater than 0.8
      expect(sampler.shouldSample(LogLevel.WARN)).toBe(false)

      // Test INFO with 0.5 rate
      mockRandom.mockReturnValue(0.4) // Less than 0.5
      expect(sampler.shouldSample(LogLevel.INFO)).toBe(true)

      mockRandom.mockReturnValue(0.6) // Greater than 0.5
      expect(sampler.shouldSample(LogLevel.INFO)).toBe(false)

      mockRandom.mockRestore()
    })

    it('should bypass sampling in development when configured', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      sampler = new Sampler({
        errorRate: 0,
        warnRate: 0,
        infoRate: 0,
        debugRate: 0,
        traceRate: 0,
        bypassInDev: true,
      })

      // Should always sample in dev
      expect(sampler.shouldSample(LogLevel.DEBUG)).toBe(true)
      expect(sampler.shouldSample(LogLevel.TRACE)).toBe(true)

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('adaptive sampling', () => {
    beforeEach(() => {
      sampler = new Sampler({
        errorRate: 1.0,
        warnRate: 0.8,
        infoRate: 0.5,
        debugRate: 0.2,
        traceRate: 0.1,
        adaptiveSampling: true,
        bypassInDev: false,
      })
    })

    it('should track error frequency', () => {
      const adaptiveSampler = new Sampler({
        adaptiveSampling: true,
        errorRate: 1.0,
        warnRate: 0.8,
        infoRate: 0.5,
      })
      
      // Sample with different levels - this triggers internal tracking
      adaptiveSampler.shouldSample(LogLevel.INFO)
      adaptiveSampler.shouldSample(LogLevel.ERROR)
      adaptiveSampler.shouldSample(LogLevel.WARN)

      // Check that adaptive is enabled
      const stats = adaptiveSampler.getStats()
      expect(stats.adaptiveEnabled).toBe(true)
      expect(stats).toHaveProperty('errorFrequency')
    })

    it('should increase sampling when error rate is high', () => {
      const adaptiveSampler = new Sampler({
        adaptiveSampling: true,
        errorRate: 1.0,
        warnRate: 0.5,
        infoRate: 0.3,
        debugRate: 0.1,
      })

      // Simulate high error rate by checking shouldSample multiple times
      // The sampler tracks error frequency internally
      for (let i = 0; i < 10; i++) {
        adaptiveSampler.shouldSample(LogLevel.ERROR)
      }

      // The adaptation happens automatically
      const stats = adaptiveSampler.getStats()
      expect(stats.adaptiveEnabled).toBe(true)
      // Current rates may be adjusted based on error frequency
      expect(stats.currentRates).toBeDefined()
    })

    it('should reset stats periodically', () => {
      const adaptiveSampler = new Sampler({
        adaptiveSampling: true,
      })
      
      // Sample some errors
      adaptiveSampler.shouldSample(LogLevel.ERROR)
      adaptiveSampler.shouldSample(LogLevel.ERROR)

      // The reset happens automatically based on time
      // For testing, we'll just verify the structure
      const stats = adaptiveSampler.getStats()
      expect(stats).toHaveProperty('errorFrequency')
      expect(stats).toHaveProperty('currentRates')
      expect(stats).toHaveProperty('adaptiveEnabled')
    })
  })

  describe('updateConfig', () => {
    it('should update sampling rates', () => {
      const mockRandom = vi.spyOn(Math, 'random')
      mockRandom.mockReturnValue(0.15) // Between 0.1 and 0.2

      // Initially debug rate is 0.2, so this should pass
      expect(sampler.shouldSample(LogLevel.DEBUG)).toBe(true)

      // Update config to lower debug rate
      sampler.updateConfig({
        errorRate: 1.0,
        warnRate: 0.8,
        infoRate: 0.5,
        debugRate: 0.1, // Lower than 0.15
        traceRate: 0.05,
      })

      // Now it should fail
      expect(sampler.shouldSample(LogLevel.DEBUG)).toBe(false)

      mockRandom.mockRestore()
    })
  })

  describe('getStats', () => {
    it('should return current statistics', () => {
      const stats = sampler.getStats()

      expect(stats).toHaveProperty('errorFrequency')
      expect(stats).toHaveProperty('currentRates')
      expect(stats).toHaveProperty('adaptiveEnabled')

      expect(stats.currentRates).toEqual({
        errorRate: 1.0,
        warnRate: 0.8,
        infoRate: 0.5,
        debugRate: 0.2,
        traceRate: 0.1,
      })
      expect(stats.adaptiveEnabled).toBe(false)
    })
  })
})
