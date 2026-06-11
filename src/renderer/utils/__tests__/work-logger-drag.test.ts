import { describe, it, expect } from 'vitest'
import {
  MINUTES_PER_DAY,
  resolveDragCreateRange,
  timelineXToMinutes,
  swimLanePixelsToMinutes,
  isDragReleased,
} from '../work-logger-drag'

describe('work-logger-drag', () => {
  describe('resolveDragCreateRange', () => {
    it('returns the anchor→release range for a forward drag', () => {
      expect(resolveDragCreateRange(360, 720, 15)).toEqual({
        startMinutes: 360,
        endMinutes: 720,
      })
    })

    it('normalizes a backward drag so start <= end', () => {
      expect(resolveDragCreateRange(720, 360, 15)).toEqual({
        startMinutes: 360,
        endMinutes: 720,
      })
    })

    it('returns null when the span is shorter than the minimum duration', () => {
      expect(resolveDragCreateRange(360, 370, 15)).toBeNull()
    })

    it('returns null for a zero-length gesture (a plain click)', () => {
      expect(resolveDragCreateRange(360, 360, 15)).toBeNull()
    })

    it('accepts a span exactly at the minimum duration', () => {
      expect(resolveDragCreateRange(360, 375, 15)).toEqual({
        startMinutes: 360,
        endMinutes: 375,
      })
    })

    it('honors a different minimum (timeline 5-minute snap)', () => {
      expect(resolveDragCreateRange(100, 104, 5)).toBeNull()
      expect(resolveDragCreateRange(100, 105, 5)).toEqual({
        startMinutes: 100,
        endMinutes: 105,
      })
    })
  })

  describe('timelineXToMinutes', () => {
    it('maps x pixels to minutes through the hour width', () => {
      // 80px per hour → 120px = 1.5h = 90 minutes
      expect(timelineXToMinutes(120, 80, 0)).toBe(90)
    })

    it('subtracts the time-label gutter before converting', () => {
      expect(timelineXToMinutes(160, 80, 40)).toBe(90)
    })

    it('clamps positions left of the gutter to 0', () => {
      expect(timelineXToMinutes(10, 80, 40)).toBe(0)
      expect(timelineXToMinutes(-500, 80, 0)).toBe(0)
    })

    it('clamps positions beyond the day to MINUTES_PER_DAY', () => {
      expect(timelineXToMinutes(80 * 25, 80, 0)).toBe(MINUTES_PER_DAY)
    })
  })

  describe('swimLanePixelsToMinutes', () => {
    // The swim-lane view renders 3 days side by side with "today" in the
    // middle, so today's minutes sit one day (24h) into the pixel space.
    const HOUR_WIDTH = 80
    const DAY_OFFSET_HOURS = 24

    it('maps a pixel inside the focused day back to its minutes', () => {
      // 9:00 today = (9h + 24h offset) * 80px = 2640px
      expect(swimLanePixelsToMinutes(2640, HOUR_WIDTH, 0, DAY_OFFSET_HOURS, 0, 24)).toBe(540)
    })

    it('subtracts the time-label gutter before converting', () => {
      expect(swimLanePixelsToMinutes(2640 + 60, HOUR_WIDTH, 60, DAY_OFFSET_HOURS, 0, 24)).toBe(540)
    })

    it('clamps positions in the previous day to the visible range start', () => {
      // 100px is far inside "yesterday"
      expect(swimLanePixelsToMinutes(100, HOUR_WIDTH, 0, DAY_OFFSET_HOURS, 0, 24)).toBe(0)
    })

    it('clamps positions in the next day to the visible range end', () => {
      // 49h * 80px is inside "tomorrow"
      expect(swimLanePixelsToMinutes(49 * HOUR_WIDTH, HOUR_WIDTH, 0, DAY_OFFSET_HOURS, 0, 24)).toBe(1440)
    })

    it('respects a restricted visible hour range', () => {
      // Visible range 8:00-18:00: positions before 8:00 clamp to 480
      expect(swimLanePixelsToMinutes(24 * HOUR_WIDTH, HOUR_WIDTH, 0, DAY_OFFSET_HOURS, 8, 18)).toBe(480)
      // Position at 20h clamps to 18:00 = 1080
      expect(swimLanePixelsToMinutes((24 + 20) * HOUR_WIDTH, HOUR_WIDTH, 0, DAY_OFFSET_HOURS, 8, 18)).toBe(1080)
    })
  })

  describe('isDragReleased', () => {
    it('is true when no buttons are held', () => {
      expect(isDragReleased(0)).toBe(true)
    })

    it('is false while the primary or any other button is held', () => {
      expect(isDragReleased(1)).toBe(false)
      expect(isDragReleased(2)).toBe(false)
      expect(isDragReleased(3)).toBe(false)
    })
  })
})
