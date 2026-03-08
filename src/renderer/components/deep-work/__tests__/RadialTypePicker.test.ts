/**
 * Tests for RadialTypePicker utility functions.
 *
 * Tests the pure layout math (getRadialPositions, getRadius) that positions
 * type buttons around a center point in a circular arrangement.
 */

import { describe, it, expect } from 'vitest'
import { getRadialPositions, getRadius } from '../RadialTypePicker'

describe('RadialTypePicker', () => {
  describe('getRadialPositions', () => {
    it('places first position at top (12 o\'clock) for any count', () => {
      const positions = getRadialPositions(4, 60)
      // First position should be directly above center (x=0, y=-radius)
      expect(positions[0].x).toBeCloseTo(0, 5)
      expect(positions[0].y).toBeCloseTo(-60, 5)
    })

    it('places 2 positions at top and bottom', () => {
      const positions = getRadialPositions(2, 60)
      expect(positions).toHaveLength(2)
      // Top
      expect(positions[0].x).toBeCloseTo(0, 5)
      expect(positions[0].y).toBeCloseTo(-60, 5)
      // Bottom
      expect(positions[1].x).toBeCloseTo(0, 5)
      expect(positions[1].y).toBeCloseTo(60, 5)
    })

    it('places 4 positions in cardinal directions', () => {
      const positions = getRadialPositions(4, 100)
      expect(positions).toHaveLength(4)
      // Top (12 o'clock)
      expect(positions[0].x).toBeCloseTo(0, 5)
      expect(positions[0].y).toBeCloseTo(-100, 5)
      // Right (3 o'clock)
      expect(positions[1].x).toBeCloseTo(100, 5)
      expect(positions[1].y).toBeCloseTo(0, 5)
      // Bottom (6 o'clock)
      expect(positions[2].x).toBeCloseTo(0, 5)
      expect(positions[2].y).toBeCloseTo(100, 5)
      // Left (9 o'clock)
      expect(positions[3].x).toBeCloseTo(-100, 5)
      expect(positions[3].y).toBeCloseTo(0, 5)
    })

    it('arranges 3 positions as equilateral triangle from top', () => {
      const positions = getRadialPositions(3, 60)
      expect(positions).toHaveLength(3)
      // Top vertex
      expect(positions[0].x).toBeCloseTo(0, 5)
      expect(positions[0].y).toBeCloseTo(-60, 5)
      // Bottom-right vertex (120 degrees from top)
      expect(positions[1].x).toBeGreaterThan(0)
      expect(positions[1].y).toBeGreaterThan(0)
      // Bottom-left vertex (240 degrees from top)
      expect(positions[2].x).toBeLessThan(0)
      expect(positions[2].y).toBeGreaterThan(0)
    })

    it('returns positions all at the same distance from center', () => {
      const radius = 75
      const positions = getRadialPositions(6, radius)

      for (const pos of positions) {
        const distance = Math.sqrt(pos.x * pos.x + pos.y * pos.y)
        expect(distance).toBeCloseTo(radius, 5)
      }
    })

    it('handles single position', () => {
      const positions = getRadialPositions(1, 60)
      expect(positions).toHaveLength(1)
      expect(positions[0].x).toBeCloseTo(0, 5)
      expect(positions[0].y).toBeCloseTo(-60, 5)
    })

    it('returns empty array for zero count', () => {
      const positions = getRadialPositions(0, 60)
      expect(positions).toHaveLength(0)
    })

    it('handles zero radius (all positions at center)', () => {
      const positions = getRadialPositions(4, 0)
      for (const pos of positions) {
        expect(pos.x).toBeCloseTo(0, 5)
        expect(pos.y).toBeCloseTo(0, 5)
      }
    })

    it('produces evenly-spaced angles for 8 positions', () => {
      const positions = getRadialPositions(8, 100)
      expect(positions).toHaveLength(8)

      // Check angular spacing: each adjacent pair should be 45 degrees (PI/4) apart
      for (let i = 0; i < positions.length; i++) {
        const next = (i + 1) % positions.length
        const angle1 = Math.atan2(positions[i].y, positions[i].x)
        const angle2 = Math.atan2(positions[next].y, positions[next].x)
        let diff = angle2 - angle1
        // Normalize to positive angle
        if (diff < 0) diff += 2 * Math.PI
        expect(diff).toBeCloseTo(Math.PI / 4, 3)
      }
    })
  })

  describe('getRadius', () => {
    it('returns small radius for 2-4 types', () => {
      const r2 = getRadius(2)
      const r3 = getRadius(3)
      const r4 = getRadius(4)
      expect(r2).toBe(60)
      expect(r3).toBe(60)
      expect(r4).toBe(60)
    })

    it('returns medium radius for 5-8 types', () => {
      const r5 = getRadius(5)
      const r6 = getRadius(6)
      const r8 = getRadius(8)
      expect(r5).toBe(70)
      expect(r6).toBe(70)
      expect(r8).toBe(70)
    })

    it('returns large radius for 9+ types', () => {
      const r9 = getRadius(9)
      const r12 = getRadius(12)
      expect(r9).toBe(85)
      expect(r12).toBe(85)
    })

    it('returns small radius for 1 type', () => {
      expect(getRadius(1)).toBe(60)
    })

    it('radius increases with type count to prevent overlap', () => {
      expect(getRadius(3)).toBeLessThanOrEqual(getRadius(6))
      expect(getRadius(6)).toBeLessThanOrEqual(getRadius(10))
    })
  })
})
