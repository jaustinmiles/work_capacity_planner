/**
 * Unit tests for RadarChart utility functions
 */

import { prepareRadarChartData, PrepareRadarDataInput, RadarChartDataPoint } from '../RadarChart'

describe('RadarChart', () => {
  describe('prepareRadarChartData', () => {
    it('returns empty array for empty task types', () => {
      const input: PrepareRadarDataInput = {
        accumulatedByType: { 'type-1': 30 },
        userTaskTypes: [],
      }
      const result = prepareRadarChartData(input)
      expect(result).toEqual([])
    })

    it('normalizes values based on maximum', () => {
      const input: PrepareRadarDataInput = {
        accumulatedByType: {
          'type-1': 100,
          'type-2': 50,
          'type-3': 25,
        },
        userTaskTypes: [
          { id: 'type-1', name: 'Coding', emoji: '💻', color: '#4A90D9' },
          { id: 'type-2', name: 'Design', emoji: '🎨', color: '#9B59B6' },
          { id: 'type-3', name: 'Admin', emoji: '📋', color: '#E67E22' },
        ],
      }
      const result = prepareRadarChartData(input)

      expect(result).toHaveLength(3)
      expect(result[0].value).toBe(1.0) // 100/100
      expect(result[1].value).toBe(0.5) // 50/100
      expect(result[2].value).toBe(0.25) // 25/100
    })

    it('handles zero values correctly', () => {
      const input: PrepareRadarDataInput = {
        accumulatedByType: {
          'type-1': 60,
          'type-2': 0,
        },
        userTaskTypes: [
          { id: 'type-1', name: 'Coding', emoji: '💻', color: '#4A90D9' },
          { id: 'type-2', name: 'Design', emoji: '🎨', color: '#9B59B6' },
        ],
      }
      const result = prepareRadarChartData(input)

      expect(result[0].value).toBe(1.0)
      expect(result[0].rawValue).toBe(60)
      expect(result[1].value).toBe(0)
      expect(result[1].rawValue).toBe(0)
    })

    it('handles missing accumulated values (defaults to 0)', () => {
      const input: PrepareRadarDataInput = {
        accumulatedByType: {
          'type-1': 30,
        },
        userTaskTypes: [
          { id: 'type-1', name: 'Coding', emoji: '💻', color: '#4A90D9' },
          { id: 'type-2', name: 'Design', emoji: '🎨', color: '#9B59B6' },
        ],
      }
      const result = prepareRadarChartData(input)

      expect(result[0].rawValue).toBe(30)
      expect(result[1].rawValue).toBe(0)
    })

    it('handles all zero values (prevents division by zero)', () => {
      const input: PrepareRadarDataInput = {
        accumulatedByType: {},
        userTaskTypes: [
          { id: 'type-1', name: 'Coding', emoji: '💻', color: '#4A90D9' },
          { id: 'type-2', name: 'Design', emoji: '🎨', color: '#9B59B6' },
        ],
      }
      const result = prepareRadarChartData(input)

      // With maxValue = 1 (minimum), 0/1 = 0
      expect(result[0].value).toBe(0)
      expect(result[1].value).toBe(0)
      expect(Number.isFinite(result[0].value)).toBe(true)
      expect(Number.isFinite(result[1].value)).toBe(true)
    })

    it('preserves task type metadata in output', () => {
      const input: PrepareRadarDataInput = {
        accumulatedByType: { 'type-1': 45 },
        userTaskTypes: [{ id: 'type-1', name: 'Deep Work', emoji: '🧠', color: '#27AE60' }],
      }
      const result = prepareRadarChartData(input)

      expect(result[0]).toMatchObject({
        typeId: 'type-1',
        label: 'Deep Work',
        emoji: '🧠',
        color: '#27AE60',
        rawValue: 45,
      })
    })

    it('maintains type order from input', () => {
      const input: PrepareRadarDataInput = {
        accumulatedByType: {
          'type-1': 10,
          'type-2': 20,
          'type-3': 30,
        },
        userTaskTypes: [
          { id: 'type-3', name: 'Third', emoji: '3️⃣', color: '#333333' },
          { id: 'type-1', name: 'First', emoji: '1️⃣', color: '#111111' },
          { id: 'type-2', name: 'Second', emoji: '2️⃣', color: '#222222' },
        ],
      }
      const result = prepareRadarChartData(input)

      expect(result[0].typeId).toBe('type-3')
      expect(result[1].typeId).toBe('type-1')
      expect(result[2].typeId).toBe('type-2')
    })

    it('returns correct structure for RadarChart consumption', () => {
      const input: PrepareRadarDataInput = {
        accumulatedByType: { 'type-1': 60 },
        userTaskTypes: [{ id: 'type-1', name: 'Work', emoji: '💼', color: '#0066CC' }],
      }
      const result = prepareRadarChartData(input)
      const dataPoint: RadarChartDataPoint = result[0]

      // Verify all required fields exist
      expect(typeof dataPoint.typeId).toBe('string')
      expect(typeof dataPoint.label).toBe('string')
      expect(typeof dataPoint.value).toBe('number')
      expect(typeof dataPoint.rawValue).toBe('number')
      expect(typeof dataPoint.color).toBe('string')
      expect(typeof dataPoint.emoji).toBe('string')

      // Verify value is normalized 0-1
      expect(dataPoint.value).toBeGreaterThanOrEqual(0)
      expect(dataPoint.value).toBeLessThanOrEqual(1)
    })

    it('handles single type correctly', () => {
      const input: PrepareRadarDataInput = {
        accumulatedByType: { 'type-1': 120 },
        userTaskTypes: [{ id: 'type-1', name: 'Solo', emoji: '🎯', color: '#FF5500' }],
      }
      const result = prepareRadarChartData(input)

      expect(result).toHaveLength(1)
      expect(result[0].value).toBe(1.0) // Max normalizes to 1
      expect(result[0].rawValue).toBe(120)
    })

    it('handles many types for polygon display', () => {
      const types = Array.from({ length: 8 }, (_, i) => ({
        id: `type-${i + 1}`,
        name: `Type ${i + 1}`,
        emoji: '📌',
        color: '#808080',
      }))

      const accumulated: Record<string, number> = {}
      types.forEach((t, i) => {
        accumulated[t.id] = (i + 1) * 10
      })

      const input: PrepareRadarDataInput = {
        accumulatedByType: accumulated,
        userTaskTypes: types,
      }
      const result = prepareRadarChartData(input)

      expect(result).toHaveLength(8)
      // Last type has 80 minutes (max), should be 1.0
      expect(result[7].value).toBe(1.0)
      // First type has 10 minutes, should be 10/80 = 0.125
      expect(result[0].value).toBe(0.125)
    })
  })
})
