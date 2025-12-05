import { describe, it, expect } from 'vitest'
import {
  calculateBlockCapacity,
  getCapacityForType,
  isTypeCompatibleWithBlock,
  BlockCapacity,
} from '../capacity-calculator'
import { BlockConfigKind } from '../enums'
import { BlockTypeConfig } from '../user-task-types'

describe('capacity-calculator', () => {
  // Helper to create block capacity with type config
  const createBlockCapacity = (
    totalMinutes: number,
    typeConfig: BlockTypeConfig,
  ): BlockCapacity => ({
    totalMinutes,
    typeConfig,
  })

  describe('calculateBlockCapacity', () => {
    it('should calculate capacity for single-type block', () => {
      const typeConfig: BlockTypeConfig = {
        kind: BlockConfigKind.Single,
        typeId: 'type-focus',
      }

      const result = calculateBlockCapacity(typeConfig, '09:00', '12:00')

      expect(result.totalMinutes).toBe(180) // 3 hours
      expect(result.typeConfig).toEqual(typeConfig)
    })

    it('should calculate capacity for combo block', () => {
      const typeConfig: BlockTypeConfig = {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-focus', ratio: 0.6 },
          { typeId: 'type-admin', ratio: 0.4 },
        ],
      }

      const result = calculateBlockCapacity(typeConfig, '09:00', '11:00')

      expect(result.totalMinutes).toBe(120) // 2 hours
      expect(result.typeConfig).toEqual(typeConfig)
    })

    it('should return zero capacity for system blocks', () => {
      const typeConfig: BlockTypeConfig = {
        kind: BlockConfigKind.System,
        systemType: 'blocked',
      }

      const result = calculateBlockCapacity(typeConfig, '12:00', '13:00')

      expect(result.totalMinutes).toBe(0)
    })

    it('should handle afternoon blocks', () => {
      const typeConfig: BlockTypeConfig = {
        kind: BlockConfigKind.Single,
        typeId: 'type-focus',
      }

      const result = calculateBlockCapacity(typeConfig, '14:00', '18:00')

      expect(result.totalMinutes).toBe(240) // 4 hours
    })
  })

  describe('getCapacityForType', () => {
    it('should return full capacity for matching single-type block', () => {
      const block = createBlockCapacity(120, {
        kind: BlockConfigKind.Single,
        typeId: 'type-focus',
      })

      const capacity = getCapacityForType(block, 'type-focus')

      expect(capacity).toBe(120)
    })

    it('should return zero for non-matching single-type block', () => {
      const block = createBlockCapacity(120, {
        kind: BlockConfigKind.Single,
        typeId: 'type-focus',
      })

      const capacity = getCapacityForType(block, 'type-admin')

      expect(capacity).toBe(0)
    })

    it('should return zero for system blocks', () => {
      const block = createBlockCapacity(60, {
        kind: BlockConfigKind.System,
        systemType: 'blocked',
      })

      const capacity = getCapacityForType(block, 'type-focus')

      expect(capacity).toBe(0)
    })

    it('should return proportional capacity for combo blocks', () => {
      const block = createBlockCapacity(100, {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-focus', ratio: 0.7 },
          { typeId: 'type-admin', ratio: 0.3 },
        ],
      })

      expect(getCapacityForType(block, 'type-focus')).toBe(70)
      expect(getCapacityForType(block, 'type-admin')).toBe(30)
    })

    it('should return zero for type not in combo block', () => {
      const block = createBlockCapacity(100, {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-focus', ratio: 0.7 },
          { typeId: 'type-admin', ratio: 0.3 },
        ],
      })

      expect(getCapacityForType(block, 'type-other')).toBe(0)
    })

    it('should floor capacity values for combo blocks', () => {
      const block = createBlockCapacity(100, {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-focus', ratio: 0.33 }, // 33 minutes
        ],
      })

      expect(getCapacityForType(block, 'type-focus')).toBe(33)
    })
  })

  describe('isTypeCompatibleWithBlock', () => {
    it('should return true for matching single-type block', () => {
      const block = createBlockCapacity(120, {
        kind: BlockConfigKind.Single,
        typeId: 'type-focus',
      })

      expect(isTypeCompatibleWithBlock(block, 'type-focus')).toBe(true)
    })

    it('should return false for non-matching single-type block', () => {
      const block = createBlockCapacity(120, {
        kind: BlockConfigKind.Single,
        typeId: 'type-focus',
      })

      expect(isTypeCompatibleWithBlock(block, 'type-admin')).toBe(false)
    })

    it('should return false for system blocks', () => {
      const block = createBlockCapacity(60, {
        kind: BlockConfigKind.System,
        systemType: 'blocked',
      })

      expect(isTypeCompatibleWithBlock(block, 'type-focus')).toBe(false)
    })

    it('should return true for type in combo block', () => {
      const block = createBlockCapacity(100, {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-focus', ratio: 0.6 },
          { typeId: 'type-admin', ratio: 0.4 },
        ],
      })

      expect(isTypeCompatibleWithBlock(block, 'type-focus')).toBe(true)
      expect(isTypeCompatibleWithBlock(block, 'type-admin')).toBe(true)
    })

    it('should return false for type not in combo block', () => {
      const block = createBlockCapacity(100, {
        kind: BlockConfigKind.Combo,
        allocations: [
          { typeId: 'type-focus', ratio: 0.6 },
          { typeId: 'type-admin', ratio: 0.4 },
        ],
      })

      expect(isTypeCompatibleWithBlock(block, 'type-other')).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty combo allocations', () => {
      const block = createBlockCapacity(100, {
        kind: BlockConfigKind.Combo,
        allocations: [],
      })

      expect(getCapacityForType(block, 'any-type')).toBe(0)
      expect(isTypeCompatibleWithBlock(block, 'any-type')).toBe(false)
    })

    it('should handle zero total minutes', () => {
      const block = createBlockCapacity(0, {
        kind: BlockConfigKind.Single,
        typeId: 'type-focus',
      })

      expect(getCapacityForType(block, 'type-focus')).toBe(0)
    })

    it('should handle very small time blocks', () => {
      const typeConfig: BlockTypeConfig = {
        kind: BlockConfigKind.Single,
        typeId: 'type-focus',
      }

      const result = calculateBlockCapacity(typeConfig, '09:00', '09:15')

      expect(result.totalMinutes).toBe(15)
    })
  })
})
