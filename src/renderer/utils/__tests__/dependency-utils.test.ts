import { describe, it, expect, vi } from 'vitest'
import {
  applyForwardDependencyChanges,
  applyReverseDependencyChanges,
  getDependencyNames,
  getDependencyIds,
  wouldCreateCircularDependency,
  getReverseDependencies,
  amendmentToDirectDependencies,
  directToAmendmentDependencies,
} from '../dependency-utils'
import { TaskStep } from '@shared/sequencing-types'
import { DependencyChange, AmendmentType, EntityType } from '@shared/amendment-types'

// Mock the logger
vi.mock('@shared/logger', () => ({
  logger: {
    ui: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}))

describe('dependency-utils', () => {
  const createStep = (id: string, name: string, dependsOn: string[] = []): TaskStep => ({
    id,
    taskId: 'task-1',
    name,
    duration: 60,
    type: 'focused' as any,
    dependsOn,
    asyncWaitTime: 0,
    status: 'pending',
    stepIndex: 0,
    percentComplete: 0,
  })

  describe('applyForwardDependencyChanges', () => {
    it('should add forward dependencies by name', () => {
      const step = createStep('step-1', 'Step 1')
      const allSteps = [
        step,
        createStep('step-2', 'Step 2'),
        createStep('step-3', 'Step 3'),
      ]

      const change: DependencyChange = {
        type: AmendmentType.DependencyChange,
        target: { type: EntityType.Workflow, name: 'Test', confidence: 1 },
        stepName: 'Step 1',
        addDependencies: ['Step 2', 'Step 3'],
      }

      applyForwardDependencyChanges(step, change, allSteps)

      expect(step.dependsOn).toEqual(['step-2', 'step-3'])
    })

    it('should remove forward dependencies by name', () => {
      const step = createStep('step-1', 'Step 1', ['step-2', 'step-3'])
      const allSteps = [
        step,
        createStep('step-2', 'Step 2'),
        createStep('step-3', 'Step 3'),
      ]

      const change: DependencyChange = {
        type: AmendmentType.DependencyChange,
        target: { type: EntityType.Workflow, name: 'Test', confidence: 1 },
        stepName: 'Step 1',
        removeDependencies: ['Step 2'],
      }

      applyForwardDependencyChanges(step, change, allSteps)

      expect(step.dependsOn).toEqual(['step-3'])
    })

    it('should not add duplicate dependencies', () => {
      const step = createStep('step-1', 'Step 1', ['step-2'])
      const allSteps = [
        step,
        createStep('step-2', 'Step 2'),
      ]

      const change: DependencyChange = {
        type: AmendmentType.DependencyChange,
        target: { type: EntityType.Workflow, name: 'Test', confidence: 1 },
        stepName: 'Step 1',
        addDependencies: ['Step 2'],
      }

      applyForwardDependencyChanges(step, change, allSteps)

      expect(step.dependsOn).toEqual(['step-2'])
    })

    it('should handle case-insensitive step names', () => {
      const step = createStep('step-1', 'Step 1')
      const allSteps = [
        step,
        createStep('step-2', 'Step 2'),
      ]

      const change: DependencyChange = {
        type: AmendmentType.DependencyChange,
        target: { type: EntityType.Workflow, name: 'Test', confidence: 1 },
        stepName: 'Step 1',
        addDependencies: ['step 2'], // lowercase
      }

      applyForwardDependencyChanges(step, change, allSteps)

      expect(step.dependsOn).toEqual(['step-2'])
    })
  })

  describe('applyReverseDependencyChanges', () => {
    it('should add reverse dependencies (make other steps depend on this)', () => {
      const targetStep = createStep('step-1', 'Step 1')
      const dependentStep = createStep('step-2', 'Step 2')
      const allSteps = [targetStep, dependentStep]

      const change: DependencyChange = {
        type: AmendmentType.DependencyChange,
        target: { type: EntityType.Workflow, name: 'Test', confidence: 1 },
        stepName: 'Step 1',
        addDependents: ['Step 2'],
      }

      applyReverseDependencyChanges(targetStep, change, allSteps)

      expect(dependentStep.dependsOn).toEqual(['step-1'])
    })

    it('should remove reverse dependencies', () => {
      const targetStep = createStep('step-1', 'Step 1')
      const dependentStep = createStep('step-2', 'Step 2', ['step-1'])
      const allSteps = [targetStep, dependentStep]

      const change: DependencyChange = {
        type: AmendmentType.DependencyChange,
        target: { type: EntityType.Workflow, name: 'Test', confidence: 1 },
        stepName: 'Step 1',
        removeDependents: ['Step 2'],
      }

      applyReverseDependencyChanges(targetStep, change, allSteps)

      expect(dependentStep.dependsOn).toEqual([])
    })

    it('should not add duplicate reverse dependencies', () => {
      const targetStep = createStep('step-1', 'Step 1')
      const dependentStep = createStep('step-2', 'Step 2', ['step-1'])
      const allSteps = [targetStep, dependentStep]

      const change: DependencyChange = {
        type: AmendmentType.DependencyChange,
        target: { type: EntityType.Workflow, name: 'Test', confidence: 1 },
        stepName: 'Step 1',
        addDependents: ['Step 2'],
      }

      applyReverseDependencyChanges(targetStep, change, allSteps)

      expect(dependentStep.dependsOn).toEqual(['step-1'])
    })
  })

  describe('getDependencyNames', () => {
    it('should convert IDs to names', () => {
      const steps = [
        { id: 'step-1', name: 'Step 1' },
        { id: 'step-2', name: 'Step 2' },
        { id: 'step-3', name: 'Step 3' },
      ]

      const names = getDependencyNames(['step-1', 'step-3'], steps)

      expect(names).toEqual(['Step 1', 'Step 3'])
    })

    it('should return ID if name not found', () => {
      const steps = [
        { id: 'step-1', name: 'Step 1' },
      ]

      const names = getDependencyNames(['step-1', 'unknown-id'], steps)

      expect(names).toEqual(['Step 1', 'unknown-id'])
    })
  })

  describe('getDependencyIds', () => {
    it('should convert names to IDs', () => {
      const steps = [
        { id: 'step-1', name: 'Step 1' },
        { id: 'step-2', name: 'Step 2' },
        { id: 'step-3', name: 'Step 3' },
      ]

      const ids = getDependencyIds(['Step 1', 'Step 3'], steps)

      expect(ids).toEqual(['step-1', 'step-3'])
    })

    it('should handle case-insensitive names', () => {
      const steps = [
        { id: 'step-1', name: 'Step 1' },
      ]

      const ids = getDependencyIds(['step 1', 'STEP 1'], steps)

      expect(ids).toEqual(['step-1', 'step-1'])
    })

    it('should filter out unknown names', () => {
      const steps = [
        { id: 'step-1', name: 'Step 1' },
      ]

      const ids = getDependencyIds(['Step 1', 'Unknown Step'], steps)

      expect(ids).toEqual(['step-1'])
    })
  })

  describe('wouldCreateCircularDependency', () => {
    it('should detect self-dependency', () => {
      const steps = [createStep('step-1', 'Step 1')]

      const result = wouldCreateCircularDependency('step-1', 'step-1', steps)

      expect(result).toBe(true)
    })

    it('should detect direct circular dependency', () => {
      const steps = [
        createStep('step-1', 'Step 1', ['step-2']),
        createStep('step-2', 'Step 2'),
      ]

      const result = wouldCreateCircularDependency('step-2', 'step-1', steps)

      expect(result).toBe(true)
    })

    it('should detect indirect circular dependency', () => {
      const steps = [
        createStep('step-1', 'Step 1', ['step-2']),
        createStep('step-2', 'Step 2', ['step-3']),
        createStep('step-3', 'Step 3'),
      ]

      const result = wouldCreateCircularDependency('step-3', 'step-1', steps)

      expect(result).toBe(true)
    })

    it('should allow non-circular dependencies', () => {
      const steps = [
        createStep('step-1', 'Step 1'),
        createStep('step-2', 'Step 2'),
      ]

      const result = wouldCreateCircularDependency('step-1', 'step-2', steps)

      expect(result).toBe(false)
    })
  })

  describe('getReverseDependencies', () => {
    it('should find all steps that depend on a given step', () => {
      const steps = [
        createStep('step-1', 'Step 1'),
        createStep('step-2', 'Step 2', ['step-1']),
        createStep('step-3', 'Step 3', ['step-1', 'step-2']),
        createStep('step-4', 'Step 4', ['step-2']),
      ]

      const dependents = getReverseDependencies('step-1', steps)

      expect(dependents).toEqual(['step-2', 'step-3'])
    })

    it('should return empty array if no dependencies', () => {
      const steps = [
        createStep('step-1', 'Step 1'),
        createStep('step-2', 'Step 2'),
      ]

      const dependents = getReverseDependencies('step-1', steps)

      expect(dependents).toEqual([])
    })
  })

  describe('amendmentToDirectDependencies', () => {
    it('should convert amendment to direct dependencies', () => {
      const steps = [
        { id: 'step-1', name: 'Step 1' },
        { id: 'step-2', name: 'Step 2' },
        { id: 'step-3', name: 'Step 3' },
      ]

      const amendment: DependencyChange = {
        type: AmendmentType.DependencyChange,
        target: { type: EntityType.Workflow, name: 'Test', confidence: 1 },
        stepName: 'Step 1',
        addDependencies: ['Step 2'],
        removeDependencies: ['Step 3'],
        addDependents: ['Step 3'],
      }

      const result = amendmentToDirectDependencies(
        amendment,
        ['step-3'], // current forward dependencies
        steps,
      )

      expect(result.forward).toEqual(['step-2']) // removed step-3, added step-2
      expect(result.reverse).toEqual(['step-3']) // added step-3 as dependent
    })
  })

  describe('directToAmendmentDependencies', () => {
    it('should convert direct changes to amendment format', () => {
      const steps = [
        { id: 'step-1', name: 'Step 1' },
        { id: 'step-2', name: 'Step 2' },
        { id: 'step-3', name: 'Step 3' },
      ]

      const result = directToAmendmentDependencies(
        ['step-1', 'step-2'], // new forward
        ['step-1', 'step-3'], // old forward
        ['step-3'], // new reverse
        [], // old reverse
        steps,
      )

      expect(result.addDependencies).toEqual(['Step 2'])
      expect(result.removeDependencies).toEqual(['Step 3'])
      expect(result.addDependents).toEqual(['Step 3'])
      expect(result.removeDependents).toBeUndefined()
    })

    it('should return undefined for empty changes', () => {
      const steps = [
        { id: 'step-1', name: 'Step 1' },
      ]

      const result = directToAmendmentDependencies(
        [], // new forward
        [], // old forward
        [], // new reverse
        [], // old reverse
        steps,
      )

      expect(result.addDependencies).toBeUndefined()
      expect(result.removeDependencies).toBeUndefined()
      expect(result.addDependents).toBeUndefined()
      expect(result.removeDependents).toBeUndefined()
    })
  })
})
