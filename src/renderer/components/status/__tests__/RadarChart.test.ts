/**
 * Unit tests for RadarChart utility functions
 */

import {
  prepareRadarChartData,
  PrepareRadarDataInput,
  RadarChartDataPoint,
  getVertexPosition,
  generatePolygonPoints,
  getAverageColor,
  formatMinutesDisplay,
  createRadarDataPointFromSink,
  TimeSinkRadarInput,
} from '../RadarChart'

describe('RadarChart', () => {
  describe('getVertexPosition', () => {
    const centerX = 150
    const centerY = 150
    const radius = 100

    it('places first vertex at top (12 o\'clock position)', () => {
      const pos = getVertexPosition(0, 4, radius, centerX, centerY)
      // First vertex should be at top: y should be less than center
      expect(pos.x).toBeCloseTo(centerX, 5)
      expect(pos.y).toBeCloseTo(centerY - radius, 5)
    })

    it('places second vertex at right for 4-point chart', () => {
      const pos = getVertexPosition(1, 4, radius, centerX, centerY)
      // Second vertex in 4-point chart should be at right (3 o'clock)
      expect(pos.x).toBeCloseTo(centerX + radius, 5)
      expect(pos.y).toBeCloseTo(centerY, 5)
    })

    it('calculates correct positions for triangle (3 vertices)', () => {
      // Triangle: top, bottom-right, bottom-left
      const top = getVertexPosition(0, 3, radius, centerX, centerY)
      const bottomRight = getVertexPosition(1, 3, radius, centerX, centerY)
      const bottomLeft = getVertexPosition(2, 3, radius, centerX, centerY)

      // Top vertex at 12 o'clock
      expect(top.y).toBeLessThan(centerY)
      // Bottom vertices below center
      expect(bottomRight.y).toBeGreaterThan(centerY)
      expect(bottomLeft.y).toBeGreaterThan(centerY)
      // Bottom right is to the right of center
      expect(bottomRight.x).toBeGreaterThan(centerX)
      // Bottom left is to the left of center
      expect(bottomLeft.x).toBeLessThan(centerX)
    })

    it('handles zero radius', () => {
      const pos = getVertexPosition(0, 4, 0, centerX, centerY)
      expect(pos.x).toBe(centerX)
      expect(pos.y).toBe(centerY)
    })

    it('handles single vertex (edge case)', () => {
      const pos = getVertexPosition(0, 1, radius, centerX, centerY)
      expect(pos.x).toBeCloseTo(centerX, 5)
      expect(pos.y).toBeCloseTo(centerY - radius, 5)
    })
  })

  describe('generatePolygonPoints', () => {
    const centerX = 100
    const centerY = 100
    const maxRadius = 50

    it('generates correct SVG points string format', () => {
      const values = [1, 1, 1] // All at max radius
      const points = generatePolygonPoints(values, maxRadius, centerX, centerY)

      // Should be "x1,y1 x2,y2 x3,y3" format
      expect(points).toMatch(/^\d+\.?\d*,\d+\.?\d*\s+\d+\.?\d*,\d+\.?\d*\s+\d+\.?\d*,\d+\.?\d*$/)
    })

    it('generates points for varying values', () => {
      const values = [1, 0.5, 0.25, 0]
      const points = generatePolygonPoints(values, maxRadius, centerX, centerY)

      const pointPairs = points.split(' ')
      expect(pointPairs).toHaveLength(4)
    })

    it('handles empty values array', () => {
      const points = generatePolygonPoints([], maxRadius, centerX, centerY)
      expect(points).toBe('')
    })

    it('handles single value', () => {
      const points = generatePolygonPoints([1], maxRadius, centerX, centerY)
      const [x, y] = points.split(',').map(Number)
      expect(x).toBeCloseTo(centerX, 5)
      expect(y).toBeCloseTo(centerY - maxRadius, 5)
    })

    it('scales points correctly based on values', () => {
      // Two values: one at max, one at half
      const values = [1, 0.5]
      const points = generatePolygonPoints(values, maxRadius, centerX, centerY)

      const pairs = points.split(' ')
      expect(pairs).toHaveLength(2)

      // First point should be at full radius (top)
      const [_x1, y1] = pairs[0].split(',').map(Number)
      expect(y1).toBeCloseTo(centerY - maxRadius, 5)

      // Second point should be at half radius (bottom)
      const [_x2, y2] = pairs[1].split(',').map(Number)
      expect(y2).toBeCloseTo(centerY + maxRadius * 0.5, 5)
    })
  })

  describe('getAverageColor', () => {
    it('returns default gray for empty array', () => {
      expect(getAverageColor([])).toBe('#808080')
    })

    it('returns the color itself for single color', () => {
      expect(getAverageColor(['#FF0000'])).toBe('#FF0000')
    })

    it('averages two colors correctly', () => {
      // Red + Blue = Purple-ish
      const result = getAverageColor(['#FF0000', '#0000FF'])
      // Average: r=127.5, g=0, b=127.5 -> #7f007f
      expect(result.toLowerCase()).toBe('#800080')
    })

    it('averages three colors correctly', () => {
      // Red + Green + Blue = Gray-ish
      const result = getAverageColor(['#FF0000', '#00FF00', '#0000FF'])
      // Average: r=85, g=85, b=85 -> #555555
      expect(result.toLowerCase()).toBe('#555555')
    })

    it('handles lowercase hex', () => {
      const result = getAverageColor(['#ff0000'])
      expect(result.toLowerCase()).toBe('#ff0000')
    })

    it('handles white color', () => {
      const result = getAverageColor(['#FFFFFF', '#FFFFFF'])
      expect(result.toUpperCase()).toBe('#FFFFFF')
    })

    it('handles black color', () => {
      const result = getAverageColor(['#000000', '#000000'])
      expect(result).toBe('#000000')
    })

    it('returns default for invalid colors', () => {
      // Colors without valid 6-char hex are skipped
      const result = getAverageColor(['#FFF', '#invalid', '#ABCDE'])
      expect(result).toBe('#808080')
    })

    it('ignores invalid colors in mix', () => {
      const result = getAverageColor(['#FF0000', '#invalid', '#FF0000'])
      // Only the valid red colors should be averaged
      expect(result.toLowerCase()).toBe('#ff0000')
    })
  })

  describe('formatMinutesDisplay', () => {
    it('formats minutes under 60', () => {
      expect(formatMinutesDisplay(0)).toBe('0m')
      expect(formatMinutesDisplay(1)).toBe('1m')
      expect(formatMinutesDisplay(30)).toBe('30m')
      expect(formatMinutesDisplay(59)).toBe('59m')
    })

    it('formats exactly 60 minutes as 1h', () => {
      expect(formatMinutesDisplay(60)).toBe('1h')
    })

    it('formats hours with remaining minutes', () => {
      expect(formatMinutesDisplay(61)).toBe('1h 1m')
      expect(formatMinutesDisplay(90)).toBe('1h 30m')
      expect(formatMinutesDisplay(125)).toBe('2h 5m')
    })

    it('formats exact hours without minutes', () => {
      expect(formatMinutesDisplay(120)).toBe('2h')
      expect(formatMinutesDisplay(180)).toBe('3h')
      expect(formatMinutesDisplay(300)).toBe('5h')
    })

    it('handles large values', () => {
      expect(formatMinutesDisplay(600)).toBe('10h')
      expect(formatMinutesDisplay(1440)).toBe('24h') // Full day
      expect(formatMinutesDisplay(1441)).toBe('24h 1m')
    })
  })

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

  describe('createRadarDataPointFromSink', () => {
    const createMockSink = (overrides: Partial<TimeSinkRadarInput> = {}): TimeSinkRadarInput => ({
      id: 'sink-123',
      name: 'Phone calls',
      emoji: '📞',
      color: '#9B59B6',
      ...overrides,
    })

    it('creates correctly structured RadarChartDataPoint', () => {
      const sink = createMockSink()
      const accumulatedMinutes = 45

      const result = createRadarDataPointFromSink(sink, accumulatedMinutes)

      expect(result).toMatchObject({
        typeId: 'sink-sink-123',
        label: 'Phone calls',
        value: 0, // Not normalized yet
        rawValue: 45,
        color: '#9B59B6',
        emoji: '📞',
      })
    })

    it('prefixes typeId with "sink-" for identification', () => {
      const sink = createMockSink({ id: 'my-custom-sink' })

      const result = createRadarDataPointFromSink(sink, 30)

      expect(result.typeId).toBe('sink-my-custom-sink')
    })

    it('sets value to 0 for later normalization', () => {
      const sink = createMockSink()

      const result = createRadarDataPointFromSink(sink, 100)

      // Value should be 0, to be normalized with other data points afterward
      expect(result.value).toBe(0)
    })

    it('preserves raw minutes value', () => {
      const sink = createMockSink()

      const result = createRadarDataPointFromSink(sink, 120)

      expect(result.rawValue).toBe(120)
    })

    it('handles zero accumulated minutes', () => {
      const sink = createMockSink()

      const result = createRadarDataPointFromSink(sink, 0)

      expect(result.rawValue).toBe(0)
    })

    it('preserves sink metadata (name, emoji, color)', () => {
      const sink = createMockSink({
        name: 'Social media',
        emoji: '📱',
        color: '#3498DB',
      })

      const result = createRadarDataPointFromSink(sink, 15)

      expect(result.label).toBe('Social media')
      expect(result.emoji).toBe('📱')
      expect(result.color).toBe('#3498DB')
    })

    it('returns structure compatible with RadarChartDataPoint interface', () => {
      const sink = createMockSink()

      const result: RadarChartDataPoint = createRadarDataPointFromSink(sink, 60)

      // TypeScript compilation confirms interface compatibility
      expect(typeof result.typeId).toBe('string')
      expect(typeof result.label).toBe('string')
      expect(typeof result.value).toBe('number')
      expect(typeof result.rawValue).toBe('number')
      expect(typeof result.color).toBe('string')
      expect(typeof result.emoji).toBe('string')
    })

    it('handles sink with special characters in name', () => {
      const sink = createMockSink({ name: "John's phone & texts" })

      const result = createRadarDataPointFromSink(sink, 20)

      expect(result.label).toBe("John's phone & texts")
    })

    it('handles large accumulated values', () => {
      const sink = createMockSink()

      const result = createRadarDataPointFromSink(sink, 1440) // 24 hours in minutes

      expect(result.rawValue).toBe(1440)
    })
  })
})
