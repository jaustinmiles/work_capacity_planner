import { describe, it, expect } from 'vitest'
import {
  generateStableStepId,
  generateRandomStepId,
  mapDependenciesToIds,
  preserveStepIds,
  validateDependencies,
  fixBrokenDependencies,
} from '../step-id-utils'

describe('Step ID Utilities', () => {
  describe('generateStableStepId', () => {
    it('should generate consistent IDs for the same inputs', () => {
      const id1 = generateStableStepId('My Workflow', 'Step 1', 0)
      const id2 = generateStableStepId('My Workflow', 'Step 1', 0)
      expect(id1).toBe(id2)
    })

    it('should generate different IDs for different inputs', () => {
      const id1 = generateStableStepId('Workflow A', 'Step 1', 0)
      const id2 = generateStableStepId('Workflow B', 'Step 1', 0)
      const id3 = generateStableStepId('Workflow A', 'Step 2', 0)
      const id4 = generateStableStepId('Workflow A', 'Step 1', 1)
      
      expect(id1).not.toBe(id2)
      expect(id1).not.toBe(id3)
      expect(id1).not.toBe(id4)
    })

    it('should start with step- prefix', () => {
      const id = generateStableStepId('Test', 'Step', 0)
      expect(id).toMatch(/^step-/)
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

    it('should start with step- prefix', () => {
      const id = generateRandomStepId()
      expect(id).toMatch(/^step-/)
    })
  })

  describe('mapDependenciesToIds', () => {
    it('should map dependency names to IDs', () => {
      const steps = [
        { id: 'step-1', name: 'Setup', dependsOn: [] },
        { id: 'step-2', name: 'Build', dependsOn: ['Setup'] },
        { id: 'step-3', name: 'Test', dependsOn: ['Build'] },
        { id: 'step-4', name: 'Deploy', dependsOn: ['Build', 'Test'] },
      ]

      const mapped = mapDependenciesToIds(steps)
      
      expect(mapped[1].dependsOn).toEqual(['step-1'])
      expect(mapped[2].dependsOn).toEqual(['step-2'])
      expect(mapped[3].dependsOn).toEqual(['step-2', 'step-3'])
    })

    it('should preserve dependencies that are already IDs', () => {
      const steps = [
        { id: 'step-1', name: 'Setup', dependsOn: [] },
        { id: 'step-2', name: 'Build', dependsOn: ['step-1'] },
        { id: 'step-3', name: 'Test', dependsOn: ['step-2'] },
      ]

      const mapped = mapDependenciesToIds(steps)
      
      expect(mapped[1].dependsOn).toEqual(['step-1'])
      expect(mapped[2].dependsOn).toEqual(['step-2'])
    })

    it('should handle mixed name and ID dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Setup', dependsOn: [] },
        { id: 'step-2', name: 'Build', dependsOn: ['Setup', 'step-1'] },
      ]

      const mapped = mapDependenciesToIds(steps)
      
      expect(mapped[1].dependsOn).toEqual(['step-1', 'step-1'])
    })

    it('should warn about unresolvable dependencies', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const steps = [
        { id: 'step-1', name: 'Setup', dependsOn: [] },
        { id: 'step-2', name: 'Build', dependsOn: ['NonExistent'] },
      ]

      const mapped = mapDependenciesToIds(steps)
      
      expect(consoleWarnSpy).toHaveBeenCalled()
      expect(mapped[1].dependsOn).toEqual(['NonExistent']) // Preserves unresolvable
      
      consoleWarnSpy.mockRestore()
    })
  })

  describe('preserveStepIds', () => {
    it('should preserve IDs for steps with same names', () => {
      const existingSteps = [
        { id: 'step-abc', name: 'Setup' },
        { id: 'step-def', name: 'Build' },
        { id: 'step-ghi', name: 'Test' },
      ]

      const newSteps = [
        { name: 'Setup', duration: 30 },
        { name: 'Build', duration: 60 },
        { name: 'Deploy', duration: 45 }, // New step
      ]

      const result = preserveStepIds(existingSteps, newSteps)
      
      expect(result[0].id).toBe('step-abc')
      expect(result[1].id).toBe('step-def')
      expect(result[2].id).toMatch(/^step-/) // New ID generated
      expect(result[2].id).not.toBe('step-abc')
      expect(result[2].id).not.toBe('step-def')
    })

    it('should generate new IDs for all steps if no existing steps', () => {
      const newSteps = [
        { name: 'Setup', duration: 30 },
        { name: 'Build', duration: 60 },
      ]

      const result = preserveStepIds([], newSteps)
      
      expect(result[0].id).toMatch(/^step-/)
      expect(result[1].id).toMatch(/^step-/)
      expect(result[0].id).not.toBe(result[1].id)
    })

    it('should preserve additional properties', () => {
      const existingSteps = [
        { id: 'step-abc', name: 'Setup' },
      ]

      const newSteps = [
        { name: 'Setup', duration: 30, type: 'focused' },
      ]

      const result = preserveStepIds(existingSteps, newSteps)
      
      expect(result[0]).toEqual({
        id: 'step-abc',
        name: 'Setup',
        duration: 30,
        type: 'focused',
      })
    })
  })

  describe('validateDependencies', () => {
    it('should validate correct dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Setup', dependsOn: [] },
        { id: 'step-2', name: 'Build', dependsOn: ['step-1'] },
        { id: 'step-3', name: 'Test', dependsOn: ['step-1', 'step-2'] },
      ]

      const result = validateDependencies(steps)
      
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect invalid dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Setup', dependsOn: [] },
        { id: 'step-2', name: 'Build', dependsOn: ['step-1', 'step-99'] },
        { id: 'step-3', name: 'Test', dependsOn: ['step-invalid'] },
      ]

      const result = validateDependencies(steps)
      
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0]).toContain('step-99')
      expect(result.errors[1]).toContain('step-invalid')
    })
  })

  describe('fixBrokenDependencies', () => {
    it('should remove invalid dependencies', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const steps = [
        { id: 'step-1', name: 'Setup', dependsOn: [] },
        { id: 'step-2', name: 'Build', dependsOn: ['step-1', 'step-invalid'] },
        { id: 'step-3', name: 'Test', dependsOn: ['step-99', 'step-2'] },
      ]

      const fixed = fixBrokenDependencies(steps)
      
      expect(fixed[1].dependsOn).toEqual(['step-1'])
      expect(fixed[2].dependsOn).toEqual(['step-2'])
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2)
      
      consoleWarnSpy.mockRestore()
    })

    it('should not modify valid dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Setup', dependsOn: [] },
        { id: 'step-2', name: 'Build', dependsOn: ['step-1'] },
        { id: 'step-3', name: 'Test', dependsOn: ['step-1', 'step-2'] },
      ]

      const fixed = fixBrokenDependencies(steps)
      
      expect(fixed).toEqual(steps)
    })

    it('should handle empty dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Setup', dependsOn: [] },
        { id: 'step-2', name: 'Build', dependsOn: [] },
      ]

      const fixed = fixBrokenDependencies(steps)
      
      expect(fixed).toEqual(steps)
    })
  })
})