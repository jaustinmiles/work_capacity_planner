/**
 * Tests for Resize Utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clampSize,
  calculateNewSize,
  calculateClampedSize,
  loadSizeFromStorage,
  saveSizeToStorage,
  getResizeCursor,
  getClientPosition,
  getTouchPosition,
} from '../resize-utils'

describe('resize-utils', () => {
  describe('clampSize', () => {
    it('should return value when within bounds', () => {
      expect(clampSize(500, 300, 800)).toBe(500)
    })

    it('should clamp to minimum when below', () => {
      expect(clampSize(100, 300, 800)).toBe(300)
    })

    it('should clamp to maximum when above', () => {
      expect(clampSize(1000, 300, 800)).toBe(800)
    })

    it('should return min when value equals min', () => {
      expect(clampSize(300, 300, 800)).toBe(300)
    })

    it('should return max when value equals max', () => {
      expect(clampSize(800, 300, 800)).toBe(800)
    })

    it('should handle negative values', () => {
      expect(clampSize(-50, 0, 100)).toBe(0)
    })

    it('should handle zero as minimum', () => {
      expect(clampSize(50, 0, 100)).toBe(50)
    })
  })

  describe('calculateNewSize', () => {
    describe('with handlePosition="start" (right sidebar)', () => {
      it('should increase size when dragging left (negative delta)', () => {
        // Start at 400px, drag handle from 400 to 350 (moved left 50px)
        const result = calculateNewSize(400, 400, 350, 'start')
        expect(result).toBe(450) // 400 - (350 - 400) = 400 - (-50) = 450
      })

      it('should decrease size when dragging right (positive delta)', () => {
        // Start at 400px, drag handle from 400 to 450 (moved right 50px)
        const result = calculateNewSize(400, 400, 450, 'start')
        expect(result).toBe(350) // 400 - (450 - 400) = 400 - 50 = 350
      })

      it('should return same size when no movement', () => {
        const result = calculateNewSize(400, 400, 400, 'start')
        expect(result).toBe(400)
      })
    })

    describe('with handlePosition="end" (left sidebar)', () => {
      it('should decrease size when dragging left (negative delta)', () => {
        // Start at 400px, drag handle from 400 to 350 (moved left 50px)
        const result = calculateNewSize(400, 400, 350, 'end')
        expect(result).toBe(350) // 400 + (350 - 400) = 400 + (-50) = 350
      })

      it('should increase size when dragging right (positive delta)', () => {
        // Start at 400px, drag handle from 400 to 450 (moved right 50px)
        const result = calculateNewSize(400, 400, 450, 'end')
        expect(result).toBe(450) // 400 + (450 - 400) = 400 + 50 = 450
      })

      it('should return same size when no movement', () => {
        const result = calculateNewSize(400, 400, 400, 'end')
        expect(result).toBe(400)
      })
    })

    it('should handle large movements', () => {
      const result = calculateNewSize(400, 500, 100, 'start')
      expect(result).toBe(800) // 400 - (100 - 500) = 400 - (-400) = 800
    })
  })

  describe('calculateClampedSize', () => {
    it('should calculate and clamp in one call', () => {
      // Would calculate to 800 but max is 600
      const result = calculateClampedSize(400, 500, 100, 'start', 300, 600)
      expect(result).toBe(600)
    })

    it('should respect minimum bounds', () => {
      // Would calculate to 200 but min is 300
      const result = calculateClampedSize(400, 400, 600, 'start', 300, 800)
      expect(result).toBe(300) // 400 - 200 = 200, clamped to 300
    })

    it('should return unclamped value when within bounds', () => {
      const result = calculateClampedSize(400, 400, 350, 'start', 300, 800)
      expect(result).toBe(450)
    })
  })

  describe('loadSizeFromStorage', () => {
    let mockStorage: Record<string, string>

    beforeEach(() => {
      mockStorage = {}
      vi.stubGlobal('window', {
        localStorage: {
          getItem: vi.fn((key: string) => mockStorage[key] ?? null),
          setItem: vi.fn((key: string, value: string) => {
            mockStorage[key] = value
          }),
        },
      })
    })

    it('should return saved value when valid', () => {
      mockStorage['sidebar-width'] = '500'
      const result = loadSizeFromStorage('sidebar-width', 400, 300, 800)
      expect(result).toBe(500)
    })

    it('should return default when key not found', () => {
      const result = loadSizeFromStorage('nonexistent-key', 400, 300, 800)
      expect(result).toBe(400)
    })

    it('should return default when value is not a number', () => {
      mockStorage['sidebar-width'] = 'invalid'
      const result = loadSizeFromStorage('sidebar-width', 400, 300, 800)
      expect(result).toBe(400)
    })

    it('should clamp saved value to min', () => {
      mockStorage['sidebar-width'] = '100'
      const result = loadSizeFromStorage('sidebar-width', 400, 300, 800)
      expect(result).toBe(300)
    })

    it('should clamp saved value to max', () => {
      mockStorage['sidebar-width'] = '1000'
      const result = loadSizeFromStorage('sidebar-width', 400, 300, 800)
      expect(result).toBe(800)
    })

    it('should handle localStorage throwing error', () => {
      vi.stubGlobal('window', {
        localStorage: {
          getItem: vi.fn(() => {
            throw new Error('localStorage disabled')
          }),
        },
      })
      const result = loadSizeFromStorage('sidebar-width', 400, 300, 800)
      expect(result).toBe(400)
    })

    it('should return default when window is undefined', () => {
      vi.stubGlobal('window', undefined)
      const result = loadSizeFromStorage('sidebar-width', 400, 300, 800)
      expect(result).toBe(400)
    })
  })

  describe('saveSizeToStorage', () => {
    let mockStorage: Record<string, string>

    beforeEach(() => {
      mockStorage = {}
      vi.stubGlobal('window', {
        localStorage: {
          getItem: vi.fn((key: string) => mockStorage[key] ?? null),
          setItem: vi.fn((key: string, value: string) => {
            mockStorage[key] = value
          }),
        },
      })
    })

    it('should save size and return true', () => {
      const result = saveSizeToStorage('sidebar-width', 500)
      expect(result).toBe(true)
      expect(window.localStorage.setItem).toHaveBeenCalledWith('sidebar-width', '500')
    })

    it('should handle localStorage throwing error', () => {
      vi.stubGlobal('window', {
        localStorage: {
          setItem: vi.fn(() => {
            throw new Error('Quota exceeded')
          }),
        },
      })
      const result = saveSizeToStorage('sidebar-width', 500)
      expect(result).toBe(false)
    })

    it('should return false when window is undefined', () => {
      vi.stubGlobal('window', undefined)
      const result = saveSizeToStorage('sidebar-width', 500)
      expect(result).toBe(false)
    })
  })

  describe('getResizeCursor', () => {
    it('should return col-resize for horizontal', () => {
      expect(getResizeCursor('horizontal')).toBe('col-resize')
    })

    it('should return row-resize for vertical', () => {
      expect(getResizeCursor('vertical')).toBe('row-resize')
    })
  })

  describe('getClientPosition', () => {
    it('should return clientX for horizontal direction', () => {
      const event = { clientX: 100, clientY: 200 }
      expect(getClientPosition(event, 'horizontal')).toBe(100)
    })

    it('should return clientY for vertical direction', () => {
      const event = { clientX: 100, clientY: 200 }
      expect(getClientPosition(event, 'vertical')).toBe(200)
    })
  })

  describe('getTouchPosition', () => {
    it('should return clientX for horizontal direction', () => {
      const touch = { clientX: 150, clientY: 250 }
      expect(getTouchPosition(touch, 'horizontal')).toBe(150)
    })

    it('should return clientY for vertical direction', () => {
      const touch = { clientX: 150, clientY: 250 }
      expect(getTouchPosition(touch, 'vertical')).toBe(250)
    })
  })
})
