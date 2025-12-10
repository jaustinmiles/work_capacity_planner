import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findEntityByName, resolveDependencyNames, EntityData } from '../target-resolver'
import { EntityType } from '@shared/amendment-types'

// Mock the logger
vi.mock('@/logger', () => ({
  logger: {
    ui: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    system: {
      info: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

describe('target-resolver', () => {
  // Sample entity data for tests
  const mockEntityData: EntityData = {
    allTasks: [
      { id: 'task-1', name: 'Buy groceries' },
      { id: 'task-2', name: 'Write report' },
      { id: 'task-3', name: 'Call mom' },
    ],
    allWorkflows: [
      {
        id: 'workflow-1',
        name: 'Morning routine',
        steps: [
          { id: 'step-1', name: 'Wake up' },
          { id: 'step-2', name: 'Brush teeth' },
          { id: 'step-3', name: 'Eat breakfast' },
        ],
      },
      {
        id: 'workflow-2',
        name: 'Project setup',
        steps: [
          { id: 'step-4', name: 'Create repository' },
          { id: 'step-5', name: 'Initialize project' },
        ],
      },
    ],
  }

  describe('findEntityByName', () => {
    describe('exact matching behavior', () => {
      it('should find task by exact name (case-insensitive)', () => {
        const result = findEntityByName('Buy groceries', undefined, mockEntityData)
        expect(result).toEqual({ id: 'task-1', type: EntityType.Task })
      })

      it('should find task with different case', () => {
        const result = findEntityByName('BUY GROCERIES', undefined, mockEntityData)
        expect(result).toEqual({ id: 'task-1', type: EntityType.Task })
      })

      it('should find task with extra whitespace trimmed', () => {
        const result = findEntityByName('  Buy groceries  ', undefined, mockEntityData)
        expect(result).toEqual({ id: 'task-1', type: EntityType.Task })
      })

      it('should NOT match partial names (no fuzzy matching)', () => {
        // This is critical - "Buy" should NOT match "Buy groceries"
        expect(findEntityByName('Buy', undefined, mockEntityData)).toBeNull()
        expect(findEntityByName('groceries', undefined, mockEntityData)).toBeNull()
        expect(findEntityByName('Write', undefined, mockEntityData)).toBeNull()
      })

      it('should NOT match substrings (no fuzzy matching)', () => {
        // "gro" should NOT match "Buy groceries"
        expect(findEntityByName('gro', undefined, mockEntityData)).toBeNull()
        expect(findEntityByName('report', undefined, mockEntityData)).toBeNull()
      })

      it('should return null for non-existent names', () => {
        expect(findEntityByName('Non-existent task', undefined, mockEntityData)).toBeNull()
      })
    })

    describe('type-specific search', () => {
      it('should find task when type is Task', () => {
        const result = findEntityByName('Buy groceries', EntityType.Task, mockEntityData)
        expect(result).toEqual({ id: 'task-1', type: EntityType.Task })
      })

      it('should find workflow when type is Workflow', () => {
        const result = findEntityByName('Morning routine', EntityType.Workflow, mockEntityData)
        expect(result).toEqual({ id: 'workflow-1', type: EntityType.Workflow })
      })

      it('should not find task when searching for workflow type', () => {
        const result = findEntityByName('Buy groceries', EntityType.Workflow, mockEntityData)
        expect(result).toBeNull()
      })

      it('should not find workflow when searching for task type', () => {
        const result = findEntityByName('Morning routine', EntityType.Task, mockEntityData)
        expect(result).toBeNull()
      })
    })

    describe('step search', () => {
      it('should find step within workflow and return workflow ID', () => {
        const result = findEntityByName('Brush teeth', EntityType.Step, mockEntityData)
        expect(result).toEqual({
          id: 'workflow-1',
          type: EntityType.Workflow,
          stepName: 'Brush teeth',
        })
      })

      it('should find step with case-insensitive match', () => {
        const result = findEntityByName('BRUSH TEETH', EntityType.Step, mockEntityData)
        expect(result).toEqual({
          id: 'workflow-1',
          type: EntityType.Workflow,
          stepName: 'Brush teeth',
        })
      })

      it('should NOT fuzzy match steps', () => {
        // "Brush" should NOT match "Brush teeth"
        expect(findEntityByName('Brush', EntityType.Step, mockEntityData)).toBeNull()
        expect(findEntityByName('teeth', EntityType.Step, mockEntityData)).toBeNull()
      })

      it('should fallback to task if step not found but task exists', () => {
        const result = findEntityByName('Buy groceries', EntityType.Step, mockEntityData)
        expect(result).toEqual({ id: 'task-1', type: EntityType.Task })
      })
    })

    describe('workflow priority', () => {
      it('should prefer workflow over task when no type specified', () => {
        // Add a task with same name as workflow
        const dataWithConflict: EntityData = {
          allTasks: [{ id: 'task-conflict', name: 'Morning routine' }],
          allWorkflows: [{ id: 'workflow-1', name: 'Morning routine' }],
        }
        const result = findEntityByName('Morning routine', undefined, dataWithConflict)
        expect(result).toEqual({ id: 'workflow-1', type: EntityType.Workflow })
      })
    })
  })

  describe('resolveDependencyNames', () => {
    it('should resolve known names to IDs', () => {
      const result = resolveDependencyNames(['Buy groceries', 'Write report'], mockEntityData)
      expect(result.resolved).toEqual(['task-1', 'task-2'])
      expect(result.unresolved).toEqual([])
    })

    it('should pass through unknown names as-is (may be existing IDs)', () => {
      const result = resolveDependencyNames(['unknown-task', 'task-123-abc'], mockEntityData)
      expect(result.resolved).toEqual(['unknown-task', 'task-123-abc'])
    })

    it('should handle mixed known and unknown names', () => {
      const result = resolveDependencyNames(
        ['Buy groceries', 'unknown-id', 'Write report'],
        mockEntityData,
      )
      expect(result.resolved).toEqual(['task-1', 'unknown-id', 'task-2'])
    })

    it('should resolve workflow names to IDs', () => {
      const result = resolveDependencyNames(['Morning routine'], mockEntityData)
      expect(result.resolved).toEqual(['workflow-1'])
    })

    it('should handle empty array', () => {
      const result = resolveDependencyNames([], mockEntityData)
      expect(result.resolved).toEqual([])
      expect(result.unresolved).toEqual([])
    })

    it('should NOT resolve partial name matches', () => {
      // "Buy" should NOT resolve to "Buy groceries" - should pass through as-is
      const result = resolveDependencyNames(['Buy'], mockEntityData)
      expect(result.resolved).toEqual(['Buy'])
    })
  })

  describe('findEntityByName edge cases', () => {
    it('should handle empty entity data', () => {
      const emptyData: EntityData = { allTasks: [], allWorkflows: [] }
      expect(findEntityByName('anything', undefined, emptyData)).toBeNull()
    })

    it('should handle workflows without steps array', () => {
      const dataWithoutSteps: EntityData = {
        allTasks: [],
        allWorkflows: [{ id: 'w1', name: 'Workflow One' }], // no steps property
      }
      const result = findEntityByName('Workflow One', EntityType.Workflow, dataWithoutSteps)
      expect(result).toEqual({ id: 'w1', type: EntityType.Workflow })
    })

    it('should return null when searching for step in workflow without steps', () => {
      const dataWithoutSteps: EntityData = {
        allTasks: [],
        allWorkflows: [{ id: 'w1', name: 'Workflow One' }],
      }
      const result = findEntityByName('Some Step', EntityType.Step, dataWithoutSteps)
      expect(result).toBeNull()
    })

    it('should find step in second workflow when not in first', () => {
      const result = findEntityByName('Initialize project', EntityType.Step, mockEntityData)
      expect(result).toEqual({
        id: 'workflow-2',
        type: EntityType.Workflow,
        stepName: 'Initialize project',
      })
    })

    it('should handle empty string name', () => {
      expect(findEntityByName('', undefined, mockEntityData)).toBeNull()
    })

    it('should handle whitespace-only name', () => {
      expect(findEntityByName('   ', undefined, mockEntityData)).toBeNull()
    })
  })

  describe('resolveDependencyNames edge cases', () => {
    it('should pass through step names unchanged (steps not searched in dependency resolution)', () => {
      // resolveDependencyNames uses findEntityByName with undefined type,
      // which only searches workflows and tasks, not steps inside workflows.
      // This is intentional - step names aren't valid dependency references.
      const result = resolveDependencyNames(['Brush teeth'], mockEntityData)
      expect(result.resolved).toEqual(['Brush teeth'])
    })

    it('should handle duplicate names in input', () => {
      const result = resolveDependencyNames(['Buy groceries', 'Buy groceries'], mockEntityData)
      expect(result.resolved).toEqual(['task-1', 'task-1'])
    })

    it('should maintain order of input array', () => {
      const result = resolveDependencyNames(
        ['Write report', 'unknown', 'Buy groceries', 'Morning routine'],
        mockEntityData,
      )
      expect(result.resolved).toEqual(['task-2', 'unknown', 'task-1', 'workflow-1'])
    })
  })
})
