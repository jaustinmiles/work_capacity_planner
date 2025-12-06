import { describe, it, expect } from 'vitest'
import {
  createTaskComparisonKey,
  createSequencedTaskComparisonKey,
  haveTasksChanged,
  haveSequencedTasksChanged,
  haveWorkSettingsChanged,
  haveActiveSessionsChanged,
  filterSchedulableItems,
  filterSchedulableWorkflows,
} from '../store-comparison'
import type { Task } from '@shared/types'
import type { SequencedTask } from '@shared/sequencing-types'
import type { WorkSettings } from '@shared/work-settings-types'
import { TaskStatus } from '@shared/enums'

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

// Helper to create a sequenced task (workflow)
function createTestWorkflow(overrides: Partial<SequencedTask> = {}): SequencedTask {
  return {
    id: 'workflow-1',
    name: 'Test Workflow',
    duration: 180,
    importance: 7,
    urgency: 6,
    type: 'focused',
    sessionId: 'session-1',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    hasSteps: true,
    overallStatus: TaskStatus.InProgress,
    criticalPathDuration: 240,
    worstCaseDuration: 300,
    createdAt: new Date(),
    updatedAt: new Date(),
    steps: [
      {
        id: 'step-1',
        taskId: 'workflow-1',
        name: 'Step 1',
        duration: 60,
        type: 'focused',
        dependsOn: [],
        asyncWaitTime: 0,
        status: 'completed',
        stepIndex: 0,
        percentComplete: 100,
      },
      {
        id: 'step-2',
        taskId: 'workflow-1',
        name: 'Step 2',
        duration: 120,
        type: 'admin',
        dependsOn: ['step-1'],
        asyncWaitTime: 0,
        status: 'pending',
        stepIndex: 1,
        percentComplete: 0,
      },
    ],
    ...overrides,
  }
}

// Helper to create work settings
function createTestWorkSettings(overrides: Partial<WorkSettings> = {}): WorkSettings {
  return {
    defaultWorkHours: {
      startTime: '09:00',
      endTime: '17:00',
      lunchStart: '12:00',
      lunchDuration: 60,
    },
    defaultCapacity: {
      maxFocusHours: 4,
      maxAdminHours: 2,
    },
    customWorkHours: {},
    customCapacity: {},
    timeZone: 'America/New_York',
    ...overrides,
  }
}

describe('store-comparison', () => {
  describe('createTaskComparisonKey', () => {
    it('should create a deterministic key from task properties', () => {
      const task = createTestTask({
        id: 'task-1',
        name: 'Build Feature',
        completed: false,
        type: 'focused',
        duration: 90,
      })

      const key = createTaskComparisonKey(task)

      expect(key).toContain('task-1')
      expect(key).toContain('Build Feature')
      expect(key).toContain('0') // not completed
      expect(key).toContain('focused')
      expect(key).toContain('90')
    })

    it('should produce same key for identical tasks', () => {
      const task1 = createTestTask({ id: 'task-1', name: 'Test' })
      const task2 = createTestTask({ id: 'task-1', name: 'Test' })

      expect(createTaskComparisonKey(task1)).toBe(createTaskComparisonKey(task2))
    })

    it('should produce different keys for different tasks', () => {
      const task1 = createTestTask({ id: 'task-1', name: 'Task A' })
      const task2 = createTestTask({ id: 'task-2', name: 'Task B' })

      expect(createTaskComparisonKey(task1)).not.toBe(createTaskComparisonKey(task2))
    })

    it('should handle null/undefined optional properties', () => {
      const task = createTestTask({
        actualDuration: undefined,
        deadline: undefined,
        cognitiveComplexity: undefined,
      })

      const key = createTaskComparisonKey(task)
      expect(key).toContain('null')
    })

    it('should include locked status', () => {
      const lockedTask = createTestTask({ isLocked: true, lockedStartTime: 540 })
      const unlockedTask = createTestTask({ isLocked: false })

      expect(createTaskComparisonKey(lockedTask)).not.toBe(createTaskComparisonKey(unlockedTask))
    })
  })

  describe('createSequencedTaskComparisonKey', () => {
    it('should create key including workflow and step properties', () => {
      const workflow = createTestWorkflow()

      const key = createSequencedTaskComparisonKey(workflow)

      expect(key).toContain('workflow-1')
      expect(key).toContain('step-1')
      expect(key).toContain('step-2')
      expect(key).toContain('|') // separator between workflow and steps
    })

    it('should produce same key for identical workflows', () => {
      const workflow1 = createTestWorkflow()
      const workflow2 = createTestWorkflow()

      expect(createSequencedTaskComparisonKey(workflow1)).toBe(
        createSequencedTaskComparisonKey(workflow2),
      )
    })

    it('should detect step status changes', () => {
      const workflow1 = createTestWorkflow()
      const workflow2 = createTestWorkflow()
      workflow2.steps[0].status = 'in_progress'

      expect(createSequencedTaskComparisonKey(workflow1)).not.toBe(
        createSequencedTaskComparisonKey(workflow2),
      )
    })

    it('should include step properties like percentComplete and asyncWaitTime', () => {
      const workflow = createTestWorkflow()
      workflow.steps[0].percentComplete = 50
      workflow.steps[0].asyncWaitTime = 30

      const key = createSequencedTaskComparisonKey(workflow)
      expect(key).toContain('50') // percentComplete
      expect(key).toContain('30') // asyncWaitTime
    })
  })

  describe('haveTasksChanged', () => {
    it('should return true when task count differs', () => {
      const current = [createTestTask({ id: 'task-1' }), createTestTask({ id: 'task-2' })]
      const previous = [createTestTask({ id: 'task-1' })]

      expect(haveTasksChanged(current, previous)).toBe(true)
    })

    it('should return false for identical task arrays', () => {
      const current = [createTestTask({ id: 'task-1' }), createTestTask({ id: 'task-2' })]
      const previous = [createTestTask({ id: 'task-1' }), createTestTask({ id: 'task-2' })]

      expect(haveTasksChanged(current, previous)).toBe(false)
    })

    it('should return true when task properties change', () => {
      const current = [createTestTask({ id: 'task-1', completed: true })]
      const previous = [createTestTask({ id: 'task-1', completed: false })]

      expect(haveTasksChanged(current, previous)).toBe(true)
    })

    it('should handle empty arrays', () => {
      expect(haveTasksChanged([], [])).toBe(false)
    })
  })

  describe('haveSequencedTasksChanged', () => {
    it('should return true when workflow count differs', () => {
      const current = [createTestWorkflow()]
      const previous: SequencedTask[] = []

      expect(haveSequencedTasksChanged(current, previous)).toBe(true)
    })

    it('should return false for identical workflow arrays', () => {
      const current = [createTestWorkflow()]
      const previous = [createTestWorkflow()]

      expect(haveSequencedTasksChanged(current, previous)).toBe(false)
    })

    it('should return true when step status changes', () => {
      const current = [createTestWorkflow()]
      const previous = [createTestWorkflow()]
      current[0].steps[1].status = 'in_progress'

      expect(haveSequencedTasksChanged(current, previous)).toBe(true)
    })
  })

  describe('haveWorkSettingsChanged', () => {
    it('should return false when both are null', () => {
      expect(haveWorkSettingsChanged(null, null)).toBe(false)
    })

    it('should return true when one is null', () => {
      const settings = createTestWorkSettings()
      expect(haveWorkSettingsChanged(settings, null)).toBe(true)
      expect(haveWorkSettingsChanged(null, settings)).toBe(true)
    })

    it('should return false for identical settings', () => {
      const current = createTestWorkSettings()
      const previous = createTestWorkSettings()

      expect(haveWorkSettingsChanged(current, previous)).toBe(false)
    })

    it('should detect work hours changes', () => {
      const current = createTestWorkSettings()
      const previous = createTestWorkSettings()
      current.defaultWorkHours.startTime = '08:00'

      expect(haveWorkSettingsChanged(current, previous)).toBe(true)
    })

    it('should detect lunch time changes', () => {
      const current = createTestWorkSettings()
      const previous = createTestWorkSettings()
      current.defaultWorkHours.lunchStart = '13:00'

      expect(haveWorkSettingsChanged(current, previous)).toBe(true)
    })

    it('should detect capacity changes', () => {
      const current = createTestWorkSettings()
      const previous = createTestWorkSettings()
      current.defaultCapacity.maxFocusHours = 6

      expect(haveWorkSettingsChanged(current, previous)).toBe(true)
    })

    it('should detect timezone changes', () => {
      const current = createTestWorkSettings({ timeZone: 'America/Los_Angeles' })
      const previous = createTestWorkSettings({ timeZone: 'America/New_York' })

      expect(haveWorkSettingsChanged(current, previous)).toBe(true)
    })

    it('should detect custom work hours changes', () => {
      const current = createTestWorkSettings({
        customWorkHours: { '2024-01-15': { startTime: '10:00', endTime: '18:00', lunchStart: '12:00', lunchDuration: 60 } },
      })
      const previous = createTestWorkSettings()

      expect(haveWorkSettingsChanged(current, previous)).toBe(true)
    })

    it('should detect custom capacity changes', () => {
      const current = createTestWorkSettings({
        customCapacity: { '2024-01-15': { maxFocusHours: 6, maxAdminHours: 3 } },
      })
      const previous = createTestWorkSettings()

      expect(haveWorkSettingsChanged(current, previous)).toBe(true)
    })
  })

  describe('haveActiveSessionsChanged', () => {
    it('should return true when size differs', () => {
      const current = new Map([['session-1', {}]])
      const previous = new Map<string, any>()

      expect(haveActiveSessionsChanged(current, previous)).toBe(true)
    })

    it('should return false for identical maps', () => {
      const current = new Map([['session-1', {}], ['session-2', {}]])
      const previous = new Map([['session-1', {}], ['session-2', {}]])

      expect(haveActiveSessionsChanged(current, previous)).toBe(false)
    })

    it('should return true when keys differ', () => {
      const current = new Map([['session-1', {}]])
      const previous = new Map([['session-2', {}]])

      expect(haveActiveSessionsChanged(current, previous)).toBe(true)
    })

    it('should handle empty maps', () => {
      expect(haveActiveSessionsChanged(new Map(), new Map())).toBe(false)
    })
  })

  describe('filterSchedulableItems', () => {
    it('should filter out completed tasks', () => {
      const tasks = [
        createTestTask({ id: 'task-1', completed: false }),
        createTestTask({ id: 'task-2', completed: true }),
        createTestTask({ id: 'task-3', completed: false }),
      ]

      const schedulable = filterSchedulableItems(tasks)

      expect(schedulable).toHaveLength(2)
      expect(schedulable.map(t => t.id)).toContain('task-1')
      expect(schedulable.map(t => t.id)).toContain('task-3')
      expect(schedulable.map(t => t.id)).not.toContain('task-2')
    })

    it('should keep all incomplete tasks', () => {
      const tasks = [
        createTestTask({ id: 'task-1', completed: false }),
        createTestTask({ id: 'task-2', completed: false }),
      ]

      const schedulable = filterSchedulableItems(tasks)
      expect(schedulable).toHaveLength(2)
    })

    it('should return empty array when all tasks completed', () => {
      const tasks = [
        createTestTask({ id: 'task-1', completed: true }),
      ]

      expect(filterSchedulableItems(tasks)).toHaveLength(0)
    })
  })

  describe('filterSchedulableWorkflows', () => {
    it('should filter out completed workflows', () => {
      const workflows = [
        createTestWorkflow({ id: 'wf-1', completed: false }),
        createTestWorkflow({ id: 'wf-2', completed: true }),
      ]

      const schedulable = filterSchedulableWorkflows(workflows)

      expect(schedulable).toHaveLength(1)
      expect(schedulable[0].id).toBe('wf-1')
    })

    it('should filter out workflows with all steps completed', () => {
      const workflow = createTestWorkflow()
      workflow.completed = false
      workflow.steps = [
        { ...workflow.steps[0], status: 'completed' },
        { ...workflow.steps[1], status: 'completed' },
      ]

      const schedulable = filterSchedulableWorkflows([workflow])
      expect(schedulable).toHaveLength(0)
    })

    it('should filter out workflows with all steps skipped', () => {
      const workflow = createTestWorkflow()
      workflow.completed = false
      workflow.steps = [
        { ...workflow.steps[0], status: 'skipped' },
        { ...workflow.steps[1], status: 'skipped' },
      ]

      const schedulable = filterSchedulableWorkflows([workflow])
      expect(schedulable).toHaveLength(0)
    })

    it('should keep workflows with at least one pending step', () => {
      const workflow = createTestWorkflow()
      workflow.steps[0].status = 'completed'
      workflow.steps[1].status = 'pending'

      const schedulable = filterSchedulableWorkflows([workflow])
      expect(schedulable).toHaveLength(1)
    })

    it('should keep workflows with in_progress steps', () => {
      const workflow = createTestWorkflow()
      workflow.steps[0].status = 'in_progress'

      const schedulable = filterSchedulableWorkflows([workflow])
      expect(schedulable).toHaveLength(1)
    })
  })
})
