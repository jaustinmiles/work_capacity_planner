import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateStableStepId,
  generateRandomStepId,
  mapDependenciesToIds,
  preserveStepIds,
  validateDependencies,
  fixBrokenDependencies,
} from './step-id-utils'

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    scheduler: {
      warn: vi.fn(),
    },
  },
}))

describe('step-id-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateStableStepId', () => {
    it('should generate consistent IDs for same inputs', () => {
      const id1 = generateStableStepId('Workflow A', 'Step 1', 0)
      const id2 = generateStableStepId('Workflow A', 'Step 1', 0)
      expect(id1).toBe(id2)
    })

    it('should generate different IDs for different workflows', () => {
      const id1 = generateStableStepId('Workflow A', 'Step 1', 0)
      const id2 = generateStableStepId('Workflow B', 'Step 1', 0)
      expect(id1).not.toBe(id2)
    })

    it('should generate different IDs for different steps', () => {
      const id1 = generateStableStepId('Workflow A', 'Step 1', 0)
      const id2 = generateStableStepId('Workflow A', 'Step 2', 1)
      expect(id1).not.toBe(id2)
    })

    it('should generate different IDs for different indices', () => {
      const id1 = generateStableStepId('Workflow A', 'Step', 0)
      const id2 = generateStableStepId('Workflow A', 'Step', 1)
      expect(id1).not.toBe(id2)
    })

    it('should handle special characters in names', () => {
      const id = generateStableStepId('Work-flow!@#', 'Step$%^', 0)
      expect(id).toMatch(/^step-[a-z0-9]+$/)
    })

    it('should handle empty strings', () => {
      const id = generateStableStepId('', '', 0)
      expect(id).toMatch(/^step-[a-z0-9]+$/)
    })

    it('should handle very long names', () => {
      const longName = 'a'.repeat(1000)
      const id = generateStableStepId(longName, longName, 0)
      expect(id).toMatch(/^step-[a-z0-9]+$/)
    })
  })

  describe('generateRandomStepId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set()
      for (let i = 0; i < 100; i++) {
        ids.add(generateRandomStepId())
      }
      expect(ids.size).toBe(100)
    })

    it('should follow the expected format', () => {
      const id = generateRandomStepId()
      expect(id).toMatch(/^step-[a-z0-9]+-[a-z0-9]+$/)
    })

    it('should include timestamp component', () => {
      const before = Date.now()
      const id = generateRandomStepId()
      const after = Date.now()

      const parts = id.split('-')
      const timestamp = parseInt(parts[1], 36)

      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('mapDependenciesToIds', () => {
    const steps = [
      { id: 'step-1', name: 'First Step' },
      { id: 'step-2', name: 'Second Step' },
      { id: 'step-3', name: 'Third Step' },
    ]

    it('should map dependency names to IDs', () => {
      const stepsWithDeps = [
        { ...steps[0], dependsOn: [] },
        { ...steps[1], dependsOn: ['First Step'] },
        { ...steps[2], dependsOn: ['First Step', 'Second Step'] },
      ]

      const result = mapDependenciesToIds(stepsWithDeps)

      expect(result[0].dependsOn).toEqual([])
      expect(result[1].dependsOn).toEqual(['step-1'])
      expect(result[2].dependsOn).toEqual(['step-1', 'step-2'])
    })

    it('should handle case-insensitive matching', () => {
      const stepsWithDeps = [
        { ...steps[0], dependsOn: [] },
        { ...steps[1], dependsOn: ['first step'] },
      ]

      const result = mapDependenciesToIds(stepsWithDeps)
      expect(result[1].dependsOn).toEqual(['step-1'])
    })

    it('should preserve existing step IDs', () => {
      const stepsWithDeps = [
        { ...steps[0], dependsOn: [] },
        { ...steps[1], dependsOn: ['step-1'] },
      ]

      const result = mapDependenciesToIds(stepsWithDeps)
      expect(result[1].dependsOn).toEqual(['step-1'])
    })

    it('should handle "Step N" format', () => {
      const stepsWithDeps = [
        { ...steps[0], dependsOn: [] },
        { ...steps[1], dependsOn: ['Step 1'] },
        { ...steps[2], dependsOn: ['step 2'] },
      ]

      const result = mapDependenciesToIds(stepsWithDeps)
      expect(result[1].dependsOn).toEqual(['step-1'])
      expect(result[2].dependsOn).toEqual(['step-2'])
    })

    it('should handle workflow step references', () => {
      const stepsWithDeps = [
        { ...steps[0], dependsOn: [] },
        { ...steps[1], dependsOn: ['My Workflow step 1'] },
      ]

      const result = mapDependenciesToIds(stepsWithDeps)
      expect(result[1].dependsOn).toEqual(['step-1'])
    })

    it('should handle fuzzy matching as last resort', () => {
      const stepsWithDeps = [
        { ...steps[0], dependsOn: [] },
        { ...steps[1], dependsOn: ['First'] },
      ]

      const result = mapDependenciesToIds(stepsWithDeps)
      expect(result[1].dependsOn).toEqual(['step-1'])
    })

    it('should filter out unresolvable dependencies', () => {
      const stepsWithDeps = [
        { ...steps[0], dependsOn: [] },
        { ...steps[1], dependsOn: ['Non-existent Step'] },
      ]

      const result = mapDependenciesToIds(stepsWithDeps)
      expect(result[1].dependsOn).toEqual([])
    })

    it('should handle missing dependsOn field', () => {
      const stepsWithoutDeps = [
        { id: 'step-1', name: 'First Step' },
        { id: 'step-2', name: 'Second Step' },
      ]

      const result = mapDependenciesToIds(stepsWithoutDeps)
      expect(result[0].dependsOn).toEqual([])
      expect(result[1].dependsOn).toEqual([])
    })

    it('should preserve all original fields', () => {
      const stepsWithExtra = [
        { id: 'step-1', name: 'First Step', duration: 60, type: 'task' },
      ]

      const result = mapDependenciesToIds(stepsWithExtra)
      expect(result[0]).toMatchObject({
        id: 'step-1',
        name: 'First Step',
        duration: 60,
        type: 'task',
        dependsOn: [],
      })
    })
  })

  describe('preserveStepIds', () => {
    it('should preserve existing IDs for matching names', () => {
      const existingSteps = [
        { id: 'step-abc', name: 'Step A' },
        { id: 'step-def', name: 'Step B' },
      ]

      const newSteps = [
        { name: 'Step A', duration: 60 },
        { name: 'Step B', duration: 30 },
        { name: 'Step C', duration: 45 },
      ]

      const result = preserveStepIds(existingSteps, newSteps)

      expect(result[0].id).toBe('step-abc')
      expect(result[1].id).toBe('step-def')
      expect(result[2].id).toMatch(/^step-[a-z0-9]+-[a-z0-9]+$/)
    })

    it('should generate new IDs for new steps', () => {
      const existingSteps = [
        { id: 'step-abc', name: 'Step A' },
      ]

      const newSteps = [
        { name: 'Step B', duration: 30 },
        { name: 'Step C', duration: 45 },
      ]

      const result = preserveStepIds(existingSteps, newSteps)

      expect(result[0].id).toMatch(/^step-[a-z0-9]+-[a-z0-9]+$/)
      expect(result[1].id).toMatch(/^step-[a-z0-9]+-[a-z0-9]+$/)
      expect(result[0].id).not.toBe(result[1].id)
    })

    it('should preserve all fields from new steps', () => {
      const existingSteps = [
        { id: 'step-abc', name: 'Step A' },
      ]

      const newSteps = [
        { name: 'Step A', duration: 60, type: 'task', priority: 'high' },
      ]

      const result = preserveStepIds(existingSteps, newSteps)

      expect(result[0]).toMatchObject({
        id: 'step-abc',
        name: 'Step A',
        duration: 60,
        type: 'task',
        priority: 'high',
      })
    })

    it('should handle empty existing steps', () => {
      const result = preserveStepIds([], [
        { name: 'Step A' },
        { name: 'Step B' },
      ])

      expect(result).toHaveLength(2)
      result.forEach(step => {
        expect(step.id).toMatch(/^step-[a-z0-9]+-[a-z0-9]+$/)
      })
    })

    it('should handle empty new steps', () => {
      const result = preserveStepIds([
        { id: 'step-abc', name: 'Step A' },
      ], [])

      expect(result).toHaveLength(0)
    })
  })

  describe('validateDependencies', () => {
    it('should validate correct dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Step A', dependsOn: [] },
        { id: 'step-2', name: 'Step B', dependsOn: ['step-1'] },
        { id: 'step-3', name: 'Step C', dependsOn: ['step-1', 'step-2'] },
      ]

      const result = validateDependencies(steps)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect invalid dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Step A', dependsOn: [] },
        { id: 'step-2', name: 'Step B', dependsOn: ['step-99'] },
      ]

      const result = validateDependencies(steps)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Step "Step B" has invalid dependency "step-99"')
    })

    it('should detect multiple invalid dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Step A', dependsOn: ['step-99'] },
        { id: 'step-2', name: 'Step B', dependsOn: ['step-88', 'step-77'] },
      ]

      const result = validateDependencies(steps)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(3)
    })

    it('should handle empty steps array', () => {
      const result = validateDependencies([])

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle steps with no dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Step A', dependsOn: [] },
        { id: 'step-2', name: 'Step B', dependsOn: [] },
      ]

      const result = validateDependencies(steps)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('fixBrokenDependencies', () => {
    it('should remove invalid dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Step A', dependsOn: [] },
        { id: 'step-2', name: 'Step B', dependsOn: ['step-1', 'step-99'] },
      ]

      const result = fixBrokenDependencies(steps)

      expect(result[0].dependsOn).toEqual([])
      expect(result[1].dependsOn).toEqual(['step-1'])
    })

    it('should keep valid dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Step A', dependsOn: [] },
        { id: 'step-2', name: 'Step B', dependsOn: ['step-1'] },
        { id: 'step-3', name: 'Step C', dependsOn: ['step-1', 'step-2'] },
      ]

      const result = fixBrokenDependencies(steps)

      expect(result[0].dependsOn).toEqual([])
      expect(result[1].dependsOn).toEqual(['step-1'])
      expect(result[2].dependsOn).toEqual(['step-1', 'step-2'])
    })

    it('should handle all dependencies being invalid', () => {
      const steps = [
        { id: 'step-1', name: 'Step A', dependsOn: ['step-99', 'step-88'] },
      ]

      const result = fixBrokenDependencies(steps)

      expect(result[0].dependsOn).toEqual([])
    })

    it('should preserve all other fields', () => {
      const steps = [
        {
          id: 'step-1',
          name: 'Step A',
          dependsOn: ['step-99'],
          duration: 60,
          type: 'task',
        },
      ]

      const result = fixBrokenDependencies(steps)

      expect(result[0]).toMatchObject({
        id: 'step-1',
        name: 'Step A',
        dependsOn: [],
        duration: 60,
        type: 'task',
      })
    })

    it('should handle empty steps array', () => {
      const result = fixBrokenDependencies([])
      expect(result).toEqual([])
    })

    it('should log warnings for removed dependencies', async () => {
      const { logger } = await import('./logger')

      const steps = [
        { id: 'step-1', name: 'Step A', dependsOn: ['step-99'] },
      ]

      fixBrokenDependencies(steps)

      // LOGGER_REMOVED: expect(logger.scheduler.warn).toHaveBeenCalledWith(
        'Removing invalid dependency "step-99" from step "Step A"',
      )
    })
  })
})
