import { describe, it, expect } from 'vitest'
import {
  searchTask,
  searchStep,
  searchTasks,
  searchWorkflowSteps,
  filterTasksBySearch,
  getMatchedStepIds,
  taskMatchesSearch,
  stepMatchesSearch,
  TaskMatchField,
  StepMatchField,
} from '../search-utils'
import { Task, TaskStep } from '../types'
import { SequencedTask } from '../sequencing-types'
import { TaskStatus } from '../enums'

// Helper to create a minimal test task
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Test Task',
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused',
    sessionId: 'session-1',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    hasSteps: false,
    overallStatus: TaskStatus.NotStarted,
    criticalPathDuration: 60,
    worstCaseDuration: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// Helper to create a minimal test step
function createTestStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: 'step-1',
    taskId: 'task-1',
    name: 'Test Step',
    duration: 30,
    type: 'focused',
    dependsOn: [],
    asyncWaitTime: 0,
    status: 'pending',
    stepIndex: 0,
    percentComplete: 0,
    ...overrides,
  }
}

describe('search-utils', () => {
  describe('searchTask', () => {
    it('should return null for empty query', () => {
      const task = createTestTask()
      expect(searchTask(task, '')).toBeNull()
      expect(searchTask(task, '   ')).toBeNull()
    })

    it('should match task name case-insensitively', () => {
      const task = createTestTask({ name: 'Build Feature' })

      const result1 = searchTask(task, 'build')
      expect(result1).not.toBeNull()
      expect(result1?.matchedFields).toContain(TaskMatchField.Name)

      const result2 = searchTask(task, 'BUILD')
      expect(result2).not.toBeNull()

      const result3 = searchTask(task, 'Feature')
      expect(result3).not.toBeNull()
    })

    it('should match task notes', () => {
      const task = createTestTask({ notes: 'Important deadline tomorrow' })

      const result = searchTask(task, 'deadline')
      expect(result).not.toBeNull()
      expect(result?.matchedFields).toContain(TaskMatchField.Notes)
    })

    it('should return null when no match', () => {
      const task = createTestTask({ name: 'Test Task', notes: 'Some notes' })

      const result = searchTask(task, 'nonexistent')
      expect(result).toBeNull()
    })

    it('should search workflow steps', () => {
      const task = createTestTask({
        hasSteps: true,
        steps: [
          createTestStep({ id: 'step-1', name: 'Design mockup' }),
          createTestStep({ id: 'step-2', name: 'Implement feature' }),
        ],
      })

      const result = searchTask(task, 'mockup')
      expect(result).not.toBeNull()
      expect(result?.matchedStepIds).toContain('step-1')
      expect(result?.matchedFields).toContain(TaskMatchField.StepName)
    })

    it('should match step notes in workflow', () => {
      const task = createTestTask({
        hasSteps: true,
        steps: [
          createTestStep({ id: 'step-1', name: 'Step 1', notes: 'Review with team' }),
        ],
      })

      const result = searchTask(task, 'review')
      expect(result).not.toBeNull()
      expect(result?.matchedStepIds).toContain('step-1')
      expect(result?.matchedFields).toContain(TaskMatchField.StepNotes)
    })

    it('should return multiple matched step IDs', () => {
      const task = createTestTask({
        hasSteps: true,
        steps: [
          createTestStep({ id: 'step-1', name: 'API design' }),
          createTestStep({ id: 'step-2', name: 'Database design' }),
          createTestStep({ id: 'step-3', name: 'Implementation' }),
        ],
      })

      const result = searchTask(task, 'design')
      expect(result?.matchedStepIds).toHaveLength(2)
      expect(result?.matchedStepIds).toContain('step-1')
      expect(result?.matchedStepIds).toContain('step-2')
    })

    it('should handle task without steps', () => {
      const task = createTestTask({ hasSteps: false })

      const result = searchTask(task, 'Test')
      expect(result).not.toBeNull()
      expect(result?.matchedStepIds).toHaveLength(0)
    })
  })

  describe('searchStep', () => {
    it('should return null for empty query', () => {
      const step = createTestStep()
      expect(searchStep(step, '')).toBeNull()
      expect(searchStep(step, '   ')).toBeNull()
    })

    it('should match step name', () => {
      const step = createTestStep({ name: 'Review Code' })

      const result = searchStep(step, 'code')
      expect(result).not.toBeNull()
      expect(result?.matchedFields).toContain(StepMatchField.Name)
    })

    it('should match step notes', () => {
      const step = createTestStep({ notes: 'Check performance metrics' })

      const result = searchStep(step, 'performance')
      expect(result).not.toBeNull()
      expect(result?.matchedFields).toContain(StepMatchField.Notes)
    })

    it('should match both name and notes', () => {
      const step = createTestStep({
        name: 'Review performance',
        notes: 'Performance is critical',
      })

      const result = searchStep(step, 'performance')
      expect(result?.matchedFields).toContain(StepMatchField.Name)
      expect(result?.matchedFields).toContain(StepMatchField.Notes)
    })

    it('should return null when no match', () => {
      const step = createTestStep({ name: 'Test', notes: 'Notes' })

      const result = searchStep(step, 'nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('searchTasks', () => {
    it('should return empty array for empty query', () => {
      const tasks = [createTestTask()]
      expect(searchTasks(tasks, '')).toEqual([])
    })

    it('should return matching tasks', () => {
      const tasks = [
        createTestTask({ id: 'task-1', name: 'Build API' }),
        createTestTask({ id: 'task-2', name: 'Build UI' }),
        createTestTask({ id: 'task-3', name: 'Write tests' }),
      ]

      const results = searchTasks(tasks, 'build')
      expect(results).toHaveLength(2)
      expect(results.map(r => r.task.id)).toContain('task-1')
      expect(results.map(r => r.task.id)).toContain('task-2')
    })

    it('should return empty array when no matches', () => {
      const tasks = [createTestTask({ name: 'Test' })]

      const results = searchTasks(tasks, 'nonexistent')
      expect(results).toEqual([])
    })

    it('should handle empty task array', () => {
      expect(searchTasks([], 'query')).toEqual([])
    })
  })

  describe('searchWorkflowSteps', () => {
    it('should return empty array for empty query', () => {
      const workflow: SequencedTask = {
        ...createTestTask({ hasSteps: true }),
        steps: [createTestStep()],
      }
      expect(searchWorkflowSteps(workflow, '')).toEqual([])
    })

    it('should return matching steps', () => {
      const workflow: SequencedTask = {
        ...createTestTask({ hasSteps: true }),
        steps: [
          createTestStep({ id: 'step-1', name: 'Design system' }),
          createTestStep({ id: 'step-2', name: 'Implement system' }),
          createTestStep({ id: 'step-3', name: 'Test features' }),
        ],
      }

      const results = searchWorkflowSteps(workflow, 'system')
      expect(results).toHaveLength(2)
    })

    it('should return empty array when workflow has no steps', () => {
      const workflow: SequencedTask = {
        ...createTestTask({ hasSteps: true }),
        steps: undefined as any,
      }

      expect(searchWorkflowSteps(workflow, 'query')).toEqual([])
    })
  })

  describe('filterTasksBySearch', () => {
    it('should return all tasks for empty query', () => {
      const tasks = [
        createTestTask({ id: 'task-1' }),
        createTestTask({ id: 'task-2' }),
      ]

      const filtered = filterTasksBySearch(tasks, '')
      expect(filtered).toHaveLength(2)
    })

    it('should filter to matching tasks only', () => {
      const tasks = [
        createTestTask({ id: 'task-1', name: 'Build API' }),
        createTestTask({ id: 'task-2', name: 'Write docs' }),
        createTestTask({ id: 'task-3', name: 'Build UI' }),
      ]

      const filtered = filterTasksBySearch(tasks, 'build')
      expect(filtered).toHaveLength(2)
      expect(filtered.map(t => t.id)).toContain('task-1')
      expect(filtered.map(t => t.id)).toContain('task-3')
    })
  })

  describe('getMatchedStepIds', () => {
    it('should return empty array for empty query', () => {
      const task = createTestTask({
        hasSteps: true,
        steps: [createTestStep()],
      })

      expect(getMatchedStepIds(task, '')).toEqual([])
    })

    it('should return empty array for non-workflow task', () => {
      const task = createTestTask({ hasSteps: false })

      expect(getMatchedStepIds(task, 'query')).toEqual([])
    })

    it('should return matched step IDs', () => {
      const task = createTestTask({
        hasSteps: true,
        steps: [
          createTestStep({ id: 'step-1', name: 'API design' }),
          createTestStep({ id: 'step-2', name: 'UI implementation' }),
        ],
      })

      const ids = getMatchedStepIds(task, 'API')
      expect(ids).toEqual(['step-1'])
    })

    it('should return empty array when workflow has no steps array', () => {
      const task = createTestTask({
        hasSteps: true,
        steps: undefined,
      })

      expect(getMatchedStepIds(task, 'query')).toEqual([])
    })
  })

  describe('taskMatchesSearch', () => {
    it('should return true for empty query', () => {
      const task = createTestTask()
      expect(taskMatchesSearch(task, '')).toBe(true)
      expect(taskMatchesSearch(task, '   ')).toBe(true)
    })

    it('should return true for matching task', () => {
      const task = createTestTask({ name: 'Build feature' })
      expect(taskMatchesSearch(task, 'build')).toBe(true)
    })

    it('should return false for non-matching task', () => {
      const task = createTestTask({ name: 'Test' })
      expect(taskMatchesSearch(task, 'nonexistent')).toBe(false)
    })
  })

  describe('stepMatchesSearch', () => {
    it('should return true for empty query', () => {
      const step = createTestStep()
      expect(stepMatchesSearch(step, '')).toBe(true)
      expect(stepMatchesSearch(step, '   ')).toBe(true)
    })

    it('should return true for matching step', () => {
      const step = createTestStep({ name: 'Review code' })
      expect(stepMatchesSearch(step, 'review')).toBe(true)
    })

    it('should return false for non-matching step', () => {
      const step = createTestStep({ name: 'Test' })
      expect(stepMatchesSearch(step, 'nonexistent')).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle special characters in search query', () => {
      const task = createTestTask({ name: 'Test (important)' })
      expect(taskMatchesSearch(task, '(important)')).toBe(true)
    })

    it('should handle unicode characters', () => {
      const task = createTestTask({ name: '开发任务' })
      expect(taskMatchesSearch(task, '开发')).toBe(true)
    })

    it('should trim whitespace from query', () => {
      const task = createTestTask({ name: 'Test Task' })
      expect(taskMatchesSearch(task, '  test  ')).toBe(true)
    })

    it('should handle null/undefined notes gracefully', () => {
      const task = createTestTask({ notes: undefined })
      expect(() => searchTask(task, 'test')).not.toThrow()
    })
  })
})
