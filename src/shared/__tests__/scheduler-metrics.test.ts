import { describe, it, expect } from 'vitest'
import {
  getUtilizationDescription,
  getDeadlineRiskDescription,
} from '../scheduler-metrics'

describe('scheduler-metrics', () => {
  describe('getUtilizationDescription', () => {
    it('should return Overloaded for utilization >= 0.95', () => {
      const result = getUtilizationDescription(0.95)

      expect(result.label).toBe('Overloaded')
      expect(result.color).toBe('#ff4d4f')
      expect(result.description).toContain('over capacity')
    })

    it('should return Overloaded for utilization > 1.0', () => {
      const result = getUtilizationDescription(1.1)

      expect(result.label).toBe('Overloaded')
    })

    it('should return Very High for utilization >= 0.85 and < 0.95', () => {
      const result = getUtilizationDescription(0.85)

      expect(result.label).toBe('Very High')
      expect(result.color).toBe('#fa8c16')
      expect(result.description).toContain('maximum capacity')
    })

    it('should return Very High for 0.90 utilization', () => {
      const result = getUtilizationDescription(0.90)

      expect(result.label).toBe('Very High')
    })

    it('should return High for utilization >= 0.70 and < 0.85', () => {
      const result = getUtilizationDescription(0.70)

      expect(result.label).toBe('High')
      expect(result.color).toBe('#faad14')
      expect(result.description).toContain('buffer time')
    })

    it('should return High for 0.80 utilization', () => {
      const result = getUtilizationDescription(0.80)

      expect(result.label).toBe('High')
    })

    it('should return Moderate for utilization >= 0.50 and < 0.70', () => {
      const result = getUtilizationDescription(0.50)

      expect(result.label).toBe('Moderate')
      expect(result.color).toBe('#52c41a')
      expect(result.description).toContain('balance')
    })

    it('should return Moderate for 0.60 utilization', () => {
      const result = getUtilizationDescription(0.60)

      expect(result.label).toBe('Moderate')
    })

    it('should return Light for utilization >= 0.25 and < 0.50', () => {
      const result = getUtilizationDescription(0.25)

      expect(result.label).toBe('Light')
      expect(result.color).toBe('#13c2c2')
      expect(result.description).toContain('available capacity')
    })

    it('should return Light for 0.40 utilization', () => {
      const result = getUtilizationDescription(0.40)

      expect(result.label).toBe('Light')
    })

    it('should return Very Light for utilization < 0.25', () => {
      const result = getUtilizationDescription(0.20)

      expect(result.label).toBe('Very Light')
      expect(result.color).toBe('#722ed1')
      expect(result.description).toContain('unused capacity')
    })

    it('should return Very Light for 0 utilization', () => {
      const result = getUtilizationDescription(0)

      expect(result.label).toBe('Very Light')
    })
  })

  describe('getDeadlineRiskDescription', () => {
    it('should return Critical for risk >= 0.8', () => {
      const result = getDeadlineRiskDescription(0.8)

      expect(result.label).toBe('Critical')
      expect(result.color).toBe('#ff4d4f')
      expect(result.icon).toBe('🚨')
      expect(result.description).toContain('Immediate action')
    })

    it('should return Critical for risk = 1.0', () => {
      const result = getDeadlineRiskDescription(1.0)

      expect(result.label).toBe('Critical')
    })

    it('should return High for risk >= 0.6 and < 0.8', () => {
      const result = getDeadlineRiskDescription(0.6)

      expect(result.label).toBe('High')
      expect(result.color).toBe('#fa8c16')
      expect(result.icon).toBe('⚠️')
      expect(result.description).toContain('minimal buffer')
    })

    it('should return High for risk = 0.7', () => {
      const result = getDeadlineRiskDescription(0.7)

      expect(result.label).toBe('High')
    })

    it('should return Medium for risk >= 0.3 and < 0.6', () => {
      const result = getDeadlineRiskDescription(0.3)

      expect(result.label).toBe('Medium')
      expect(result.color).toBe('#faad14')
      expect(result.icon).toBe('📅')
      expect(result.description).toContain('manageable')
    })

    it('should return Medium for risk = 0.5', () => {
      const result = getDeadlineRiskDescription(0.5)

      expect(result.label).toBe('Medium')
    })

    it('should return Low for risk > 0 and < 0.3', () => {
      const result = getDeadlineRiskDescription(0.1)

      expect(result.label).toBe('Low')
      expect(result.color).toBe('#52c41a')
      expect(result.icon).toBe('✓')
      expect(result.description).toContain('well-buffered')
    })

    it('should return Low for risk = 0.2', () => {
      const result = getDeadlineRiskDescription(0.2)

      expect(result.label).toBe('Low')
    })

    it('should return None for risk = 0', () => {
      const result = getDeadlineRiskDescription(0)

      expect(result.label).toBe('None')
      expect(result.color).toBe('#95de64')
      expect(result.icon).toBe('✨')
      expect(result.description).toContain('No deadline concerns')
    })

    it('should return None for negative risk (edge case)', () => {
      const result = getDeadlineRiskDescription(-0.1)

      expect(result.label).toBe('None')
    })
  })
})
