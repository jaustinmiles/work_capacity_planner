import { describe, it, expect } from 'vitest'
import { validateConvertedItems, convertToUnifiedItems, UNTYPED_TASK_MARKER } from '../scheduler-converters'
import { UnifiedScheduleItem } from '../unified-scheduler'
import { StepStatus } from '../enums'
import type { Task, TaskStep } from '../types'
import type { SequencedTask } from '../sequencing-types'

// Helper to create a valid item
function createValidItem(overrides: Partial<UnifiedScheduleItem> = {}): UnifiedScheduleItem {
  return {
    id: 'item-1',
    name: 'Test Item',
    duration: 60,
    type: 'task',
    taskType: 'focus',
    importance: 5,
    urgency: 5,
    cognitiveComplexity: 3,
    dependencies: [],
    deadline: null,
    isLocked: false,
    lockedStartTime: null,
    sourceId: 'task-1',
    sourceType: 'task',
    ...overrides,
  }
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    duration: 30,
    importance: 5,
    urgency: 5,
    type: 'focused',
    category: 'default',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    hasSteps: false,
    overallStatus: 'not_started' as any,
    criticalPathDuration: 0,
    worstCaseDuration: 0,
    archived: false,
    inActiveSprint: false,
    sessionId: 'session-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    isLocked: false,
    ...overrides,
  }
}

function makeStep(id: string, taskId: string, overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id,
    name: `Step ${id}`,
    duration: 15,
    type: 'focused',
    taskId,
    dependsOn: [],
    asyncWaitTime: 0,
    status: StepStatus.Pending,
    stepIndex: 0,
    percentComplete: 0,
    isAsyncTrigger: false,
    ...overrides,
  }
}

function makeWorkflow(id: string, steps: TaskStep[], overrides: Partial<Task> = {}): SequencedTask {
  return {
    ...makeTask(id, { hasSteps: true, ...overrides }),
    steps,
    hasSteps: true,
  } as SequencedTask
}

describe('scheduler-converters', () => {
  describe('validateConvertedItems', () => {
    it('should pass for valid items', () => {
      const items = [createValidItem()]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })

    it('should pass for empty array', () => {
      expect(() => validateConvertedItems([])).not.toThrow()
    })

    it('should throw for duplicate IDs', () => {
      const items = [
        createValidItem({ id: 'same-id' }),
        createValidItem({ id: 'same-id' }),
      ]
      expect(() => validateConvertedItems(items)).toThrow('Duplicate item ID detected: same-id')
    })

    it('should throw for missing ID', () => {
      const items = [createValidItem({ id: '' })]
      expect(() => validateConvertedItems(items)).toThrow('Item missing required ID')
    })

    it('should throw for missing name', () => {
      const items = [createValidItem({ name: '' })]
      expect(() => validateConvertedItems(items)).toThrow('missing required name')
    })

    it('should throw for null duration', () => {
      const items = [createValidItem({ duration: null as any })]
      expect(() => validateConvertedItems(items)).toThrow('invalid duration')
    })

    it('should throw for negative duration', () => {
      const items = [createValidItem({ duration: -10 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid duration')
    })

    it('should throw for missing type', () => {
      const items = [createValidItem({ type: '' as any })]
      expect(() => validateConvertedItems(items)).toThrow('missing required type')
    })

    it('should throw for importance out of range (low)', () => {
      const items = [createValidItem({ importance: 0 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid importance')
    })

    it('should throw for importance out of range (high)', () => {
      const items = [createValidItem({ importance: 11 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid importance')
    })

    it('should throw for urgency out of range (low)', () => {
      const items = [createValidItem({ urgency: 0 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid urgency')
    })

    it('should throw for urgency out of range (high)', () => {
      const items = [createValidItem({ urgency: 11 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid urgency')
    })

    it('should throw for cognitive complexity out of range (low)', () => {
      const items = [createValidItem({ cognitiveComplexity: 0 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid cognitive complexity')
    })

    it('should throw for cognitive complexity out of range (high)', () => {
      const items = [createValidItem({ cognitiveComplexity: 6 })]
      expect(() => validateConvertedItems(items)).toThrow('invalid cognitive complexity')
    })

    it('should allow null importance', () => {
      const items = [createValidItem({ importance: null })]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })

    it('should allow null urgency', () => {
      const items = [createValidItem({ urgency: null })]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })

    it('should allow null cognitiveComplexity', () => {
      const items = [createValidItem({ cognitiveComplexity: null })]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })

    it('should validate multiple items', () => {
      const items = [
        createValidItem({ id: 'item-1' }),
        createValidItem({ id: 'item-2' }),
        createValidItem({ id: 'item-3' }),
      ]
      expect(() => validateConvertedItems(items)).not.toThrow()
    })
  })

  describe('convertToUnifiedItems', () => {
    it('converts a simple task to unified format', () => {
      const task = makeTask('task-1')
      const { activeItems, completedItemIds } = convertToUnifiedItems([task])

      expect(activeItems).toHaveLength(1)
      expect(activeItems[0]!.id).toBe('task-1')
      expect(completedItemIds.size).toBe(0)
    })

    it('puts completed tasks in completedItemIds', () => {
      const task = makeTask('task-1', { completed: true })
      const { activeItems, completedItemIds } = convertToUnifiedItems([task])

      expect(activeItems).toHaveLength(0)
      expect(completedItemIds.has('task-1')).toBe(true)
    })

    it('deduplicates tasks with the same ID', () => {
      const task = makeTask('task-1')
      const { activeItems } = convertToUnifiedItems([task, task])

      // Second copy should be skipped (lines 199-200)
      expect(activeItems).toHaveLength(1)
    })

    it('converts workflow steps to unified format', () => {
      const step1 = makeStep('step-1', 'wf-1')
      const step2 = makeStep('step-2', 'wf-1', { dependsOn: ['step-1'] })
      const wf = makeWorkflow('wf-1', [step1, step2])

      const { activeItems } = convertToUnifiedItems([wf])

      expect(activeItems).toHaveLength(2)
      expect(activeItems[0]!.workflowId).toBe('wf-1')
      expect(activeItems[1]!.dependencies).toEqual(['step-1'])
    })

    it('adds deadline and deadlineType from parent workflow to steps', () => {
      const deadline = new Date('2025-06-01')
      const step1 = makeStep('step-1', 'wf-1')
      const wf = makeWorkflow('wf-1', [step1], { deadline, deadlineType: 'hard' })

      const { activeItems } = convertToUnifiedItems([wf])

      expect(activeItems).toHaveLength(1)
      expect(activeItems[0]!.deadline).toEqual(deadline)
      expect(activeItems[0]!.deadlineType).toBe('hard')
    })

    it('handles waiting steps — adds to completedItemIds but keeps in activeItems', () => {
      const completedAt = new Date('2025-01-15T10:00:00Z')
      const step1 = makeStep('step-1', 'wf-1', {
        status: StepStatus.Waiting,
        completedAt,
      })
      const wf = makeWorkflow('wf-1', [step1])

      const { activeItems, completedItemIds } = convertToUnifiedItems([wf])

      // Waiting steps go in completedItemIds (to unblock dependents)
      expect(completedItemIds.has('step-1')).toBe(true)
      // But remain in activeItems with isWaitingOnAsync flag
      expect(activeItems).toHaveLength(1)
      expect(activeItems[0]!.isWaitingOnAsync).toBe(true)
      expect(activeItems[0]!.completedAt).toEqual(completedAt)
    })

    it('deduplicates workflow steps with the same ID', () => {
      const step1 = makeStep('step-1', 'wf-1')
      // Create workflow with two copies of the same step
      const wf = makeWorkflow('wf-1', [step1, step1])

      const { activeItems } = convertToUnifiedItems([wf])

      // Second copy should be skipped (lines 112-113)
      expect(activeItems).toHaveLength(1)
    })

    it('logs warning for workflow with no active steps', () => {
      // All steps completed → 0 added → triggers warning (lines 69-75)
      const step1 = makeStep('step-1', 'wf-1', { status: StepStatus.Completed })
      const step2 = makeStep('step-2', 'wf-1', { status: StepStatus.Completed })
      const wf = makeWorkflow('wf-1', [step1, step2], { completed: false })

      const { activeItems, completedItemIds } = convertToUnifiedItems([wf])

      expect(activeItems).toHaveLength(0)
      expect(completedItemIds.has('step-1')).toBe(true)
      expect(completedItemIds.has('step-2')).toBe(true)
    })

    it('uses UNTYPED_TASK_MARKER for tasks without a type', () => {
      const task = makeTask('task-1', { type: '' })
      const { activeItems } = convertToUnifiedItems([task])

      expect(activeItems[0]!.taskTypeId).toBe(UNTYPED_TASK_MARKER)
    })
  })
})
