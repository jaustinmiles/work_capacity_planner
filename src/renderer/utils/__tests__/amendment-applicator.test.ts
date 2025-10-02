import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyAmendments } from '../amendment-applicator'
import {
  Amendment,
  StatusUpdate,
  TimeLog,
  NoteAddition,
  DurationChange,
  StepAddition,
  StepRemoval,
  DeadlineChange,
  PriorityChange,
  TypeChange,
  AmendmentType,
  EntityType,
  TaskType,
  DeadlineType,
} from '../../../shared/amendment-types'
import { Message } from '../../components/common/Message'

// Mock the database service
const mockDatabase = {
  updateTask: vi.fn(),
  updateSequencedTask: vi.fn(),
  getTaskById: vi.fn(),
  getSequencedTaskById: vi.fn(),
  createWorkSession: vi.fn(),
  updateTaskStep: vi.fn(),
  updateTaskStepProgress: vi.fn(),
  addStepToWorkflow: vi.fn(),
  getStepWorkSessions: vi.fn(),
  createStepWorkSession: vi.fn(),
  // Add missing methods needed by useTaskStore
  getTasks: vi.fn().mockResolvedValue([]),
  getSequencedTasks: vi.fn().mockResolvedValue([]),
}

vi.mock('../../services/database', () => ({
  getDatabase: () => mockDatabase,
}))

// Mock the Message component
vi.mock('../../components/common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock the events module
const mockAppEvents = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}

vi.mock('../events', () => ({
  appEvents: mockAppEvents,
  EVENTS: {
    DATA_REFRESH_NEEDED: 'DATA_REFRESH_NEEDED',
    TASK_UPDATED: 'TASK_UPDATED',
    WORKFLOW_UPDATED: 'WORKFLOW_UPDATED',
    SESSION_CHANGED: 'SESSION_CHANGED',
  },
}))

describe('Amendment Applicator', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    Object.values(mockDatabase).forEach(fn => fn.mockReset())
    // Re-set default return values for getTasks and getSequencedTasks after reset
    mockDatabase.getTasks.mockResolvedValue([])
    mockDatabase.getSequencedTasks.mockResolvedValue([])
    // Reset event mocks
    mockAppEvents.emit.mockClear()
    mockAppEvents.on.mockClear()
    mockAppEvents.off.mockClear()
  })

  describe('Status Updates', () => {
    it('should update task status to completed', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        newStatus: 'completed',
      }

      mockDatabase.updateTask.mockResolvedValue(true)

      await applyAmendments([amendment])

      expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-1', {
        completed: true,
        overallStatus: 'completed',
      })
      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
    })

    it('should update workflow status to in_progress', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newStatus: 'in_progress',
      }

      mockDatabase.updateSequencedTask.mockResolvedValue(true)

      await applyAmendments([amendment])

      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('wf-1', {
        overallStatus: 'in_progress',
      })
      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
    })

    it('should handle workflow step status updates', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newStatus: 'completed',
        stepName: 'Implementation',
      }

      // Mock the workflow with steps
      mockDatabase.getSequencedTaskById.mockResolvedValue({
        id: 'wf-1',
        name: 'Test Workflow',
        steps: [
          { id: 'step-1', name: 'Design', status: 'not_started' },
          { id: 'step-2', name: 'Implementation', status: 'in_progress' },
          { id: 'step-3', name: 'Testing', status: 'not_started' },
        ],
      })

      await applyAmendments([amendment])

      expect(mockDatabase.getSequencedTaskById).toHaveBeenCalledWith('wf-1')
      expect(mockDatabase.updateTaskStepProgress).toHaveBeenCalledWith('step-2', {
        status: 'completed',
      })
      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
    })

    it('should warn when target is not found', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'task',
          name: 'Unknown Task',
          confidence: 0.3,
        },
        newStatus: 'completed',
      }

      await applyAmendments([amendment])

      expect(Message.warning).toHaveBeenCalledWith('Cannot update Unknown Task - not found')
      expect(Message.error).toHaveBeenCalledWith('Failed to apply 1 amendment')
    })
  })

  describe('Time Logging', () => {
    it('should log time for a task', async () => {
      const amendment: TimeLog = {
        type: 'time_log',
        target: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        duration: 120, // 2 hours
      }

      mockDatabase.createWorkSession.mockResolvedValue(true)

      await applyAmendments([amendment])

      expect(mockDatabase.createWorkSession).toHaveBeenCalledWith({
        taskId: 'task-1',
        date: expect.any(String),
        plannedMinutes: 120,
        actualMinutes: 120,
        type: 'focused',
      })
      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
    })

    it('should log time with specific date', async () => {
      const specificDate = new Date('2024-01-15')
      const amendment: TimeLog = {
        type: 'time_log',
        target: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        duration: 60,
        date: specificDate,
      }

      mockDatabase.createWorkSession.mockResolvedValue(true)

      await applyAmendments([amendment])

      expect(mockDatabase.createWorkSession).toHaveBeenCalledWith({
        taskId: 'task-1',
        date: '2024-01-15',
        plannedMinutes: 60,
        actualMinutes: 60,
        type: 'focused',
      })
    })

    it('should handle workflow step time logging', async () => {
      const amendment: TimeLog = {
        type: 'time_log',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        duration: 90,
        stepName: 'Testing',
      }

      // Mock the workflow with steps
      mockDatabase.getSequencedTaskById.mockResolvedValue({
        id: 'wf-1',
        name: 'Test Workflow',
        steps: [
          { id: 'step-1', name: 'Implementation', duration: 30, type: 'focused' },
          { id: 'step-2', name: 'Testing', duration: 45, type: 'focused' },
        ],
      })

      await applyAmendments([amendment])

      // Should create a work session for the step
      expect(mockDatabase.createWorkSession).toHaveBeenCalledWith({
        stepId: 'step-2',
        taskId: 'wf-1',
        date: expect.any(Date),
        plannedMinutes: 45,
        actualMinutes: 90,
        description: 'Time logged for step: Testing',
        type: 'focused',
      })
    })
  })

  describe('Note Addition', () => {
    it('should add note to task', async () => {
      const amendment: NoteAddition = {
        type: 'note_addition',
        target: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        note: 'Waiting for approval',
        append: true,
      }

      mockDatabase.getTaskById.mockResolvedValue({
        id: 'task-1',
        name: 'Test Task',
        notes: 'Existing notes',
      })
      mockDatabase.updateTask.mockResolvedValue(true)

      await applyAmendments([amendment])

      expect(mockDatabase.getTaskById).toHaveBeenCalledWith('task-1')
      expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-1', {
        notes: 'Existing notes\nWaiting for approval',
      })
      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
    })

    it('should replace existing notes when append is false', async () => {
      const amendment: NoteAddition = {
        type: 'note_addition',
        target: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        note: 'New note',
        append: false,
      }

      mockDatabase.getTaskById.mockResolvedValue({
        id: 'task-1',
        name: 'Test Task',
        notes: 'Old notes',
      })
      mockDatabase.updateTask.mockResolvedValue(true)

      await applyAmendments([amendment])

      expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-1', {
        notes: 'New note',
      })
    })

    it('should add note to workflow', async () => {
      const amendment: NoteAddition = {
        type: 'note_addition',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        note: 'Design approved',
        append: true,
      }

      mockDatabase.getSequencedTaskById.mockResolvedValue({
        id: 'wf-1',
        name: 'Test Workflow',
        notes: null,
      })
      mockDatabase.updateSequencedTask.mockResolvedValue(true)

      await applyAmendments([amendment])

      expect(mockDatabase.getSequencedTaskById).toHaveBeenCalledWith('wf-1')
      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('wf-1', {
        notes: 'Design approved',
      })
    })

    it('should handle workflow step notes', async () => {
      const amendment: NoteAddition = {
        type: 'note_addition',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        note: 'Step completed successfully',
        append: true,
        stepName: 'Implementation',
      }

      // Mock the workflow with steps
      mockDatabase.getSequencedTaskById.mockResolvedValue({
        id: 'wf-1',
        name: 'Test Workflow',
        steps: [
          { id: 'step-1', name: 'Implementation', notes: null },
          { id: 'step-2', name: 'Testing', notes: null },
        ],
      })

      await applyAmendments([amendment])

      // Should update the step notes
      expect(mockDatabase.updateTaskStepProgress).toHaveBeenCalledWith('step-1', {
        notes: 'Step completed successfully',
      })
    })
  })

  describe('Duration Changes', () => {
    it('should update task duration', async () => {
      const amendment: DurationChange = {
        type: 'duration_change',
        target: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        newDuration: 240, // 4 hours
      }

      mockDatabase.updateTask.mockResolvedValue(true)

      await applyAmendments([amendment])

      expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-1', {
        duration: 240,
      })
      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
    })

    it('should update workflow duration', async () => {
      const amendment: DurationChange = {
        type: 'duration_change',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newDuration: 480, // 8 hours
      }

      mockDatabase.updateSequencedTask.mockResolvedValue(true)

      await applyAmendments([amendment])

      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('wf-1', {
        duration: 480,
      })
    })

    it('should handle workflow step duration changes', async () => {
      const amendment: DurationChange = {
        type: 'duration_change',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newDuration: 120,
        stepName: 'Testing',
      }

      // Mock the workflow with steps
      mockDatabase.getSequencedTaskById.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Test Workflow',
        steps: [
          { id: 'step-1', name: 'Implementation', duration: 30 },
          { id: 'step-2', name: 'Testing', duration: 45 },
        ],
      })
      // Mock the second call after update
      mockDatabase.getSequencedTaskById.mockResolvedValueOnce({
        id: 'wf-1',
        name: 'Test Workflow',
        steps: [
          { id: 'step-1', name: 'Implementation', duration: 30 },
          { id: 'step-2', name: 'Testing', duration: 120 },
        ],
      })

      await applyAmendments([amendment])

      // Should update the step duration and recalculate workflow total
      expect(mockDatabase.updateTaskStepProgress).toHaveBeenCalledWith('step-2', {
        duration: 120,
      })
      // Should recalculate total workflow duration
      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('wf-1', {
        duration: expect.any(Number),
      })
    })
  })

  describe('Step Addition', () => {
    it('should handle step addition to workflow', async () => {
      const amendment: StepAddition = {
        type: 'step_addition',
        workflowTarget: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        stepName: 'Code Review',
        duration: 60,
        stepType: 'focused',
        afterStep: 'Implementation',
      }

      // Mock the database method
      mockDatabase.addStepToWorkflow.mockResolvedValue({
        id: 'wf-1',
        name: 'Test Workflow',
        steps: [],
      })

      await applyAmendments([amendment])

      expect(mockDatabase.addStepToWorkflow).toHaveBeenCalledWith('wf-1', {
        name: 'Code Review',
        duration: 60,
        type: 'focused',
        afterStep: 'Implementation',
        beforeStep: undefined,
        dependencies: undefined,
        asyncWaitTime: 0,
      })

      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
    })

    it('should warn when workflow target is not found', async () => {
      const amendment: StepAddition = {
        type: 'step_addition',
        workflowTarget: {
          type: 'workflow',
          name: 'Unknown Workflow',
          confidence: 0.3,
        },
        stepName: 'New Step',
        duration: 30,
      }

      await applyAmendments([amendment])

      expect(Message.warning).toHaveBeenCalledWith(
        'Cannot add step to Unknown Workflow - workflow not found',
      )
    })
  })

  describe('Multiple Amendments', () => {
    it('should apply multiple amendments successfully', async () => {
      const amendments: Amendment[] = [
        {
          type: 'status_update',
          target: {
            type: 'task',
            id: 'task-1',
            name: 'Task 1',
            confidence: 0.9,
          },
          newStatus: 'completed',
        },
        {
          type: 'time_log',
          target: {
            type: 'task',
            id: 'task-2',
            name: 'Task 2',
            confidence: 0.9,
          },
          duration: 60,
        },
        {
          type: 'note_addition',
          target: {
            type: 'task',
            id: 'task-3',
            name: 'Task 3',
            confidence: 0.9,
          },
          note: 'Test note',
          append: true,
        },
      ]

      mockDatabase.updateTask.mockResolvedValue(true)
      mockDatabase.createWorkSession.mockResolvedValue(true)
      mockDatabase.getTaskById.mockResolvedValue({ id: 'task-3', notes: '' })

      await applyAmendments(amendments)

      expect(mockDatabase.updateTask).toHaveBeenCalledTimes(2)
      expect(mockDatabase.createWorkSession).toHaveBeenCalledTimes(1)
      expect(Message.success).toHaveBeenCalledWith('Applied 3 amendments')
    })

    it('should report partial success', async () => {
      const amendments: Amendment[] = [
        {
          type: 'status_update',
          target: {
            type: 'task',
            id: 'task-1',
            name: 'Task 1',
            confidence: 0.9,
          },
          newStatus: 'completed',
        },
        {
          type: 'status_update',
          target: {
            type: 'task',
            name: 'Unknown Task',
            confidence: 0.2,
          },
          newStatus: 'in_progress',
        },
      ]

      mockDatabase.updateTask.mockResolvedValue(true)

      await applyAmendments(amendments)

      expect(mockDatabase.updateTask).toHaveBeenCalledTimes(1)
      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
      expect(Message.error).toHaveBeenCalledWith('Failed to apply 1 amendment')
    })

    it('should handle errors gracefully', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        newStatus: 'completed',
      }

      mockDatabase.updateTask.mockRejectedValue(new Error('Database error'))

      await applyAmendments([amendment])

      expect(Message.error).toHaveBeenCalledWith('Failed to apply 1 amendment')
    })
  })

  describe('Complex Workflow Scenarios', () => {
    it('should handle multiple step completions for a single workflow', async () => {
      // Test case for the critical bug - completing all bug steps
      const amendments: StatusUpdate[] = [
        {
          type: 'status_update',
          target: {
            type: 'workflow',
            id: 'bug-workflow',
            name: 'Parallel Bug Fixes with Individual Simulations',
            confidence: 0.9,
          },
          newStatus: 'completed',
          stepName: 'Fix bug 1',
        },
        {
          type: 'status_update',
          target: {
            type: 'workflow',
            id: 'bug-workflow',
            name: 'Parallel Bug Fixes with Individual Simulations',
            confidence: 0.9,
          },
          newStatus: 'completed',
          stepName: 'Fix bug 2',
        },
        {
          type: 'status_update',
          target: {
            type: 'workflow',
            id: 'bug-workflow',
            name: 'Parallel Bug Fixes with Individual Simulations',
            confidence: 0.9,
          },
          newStatus: 'completed',
          stepName: 'Fix bug 3',
        },
      ]

      // Mock the workflow with steps
      mockDatabase.getSequencedTaskById.mockResolvedValue({
        id: 'bug-workflow',
        name: 'Parallel Bug Fixes with Individual Simulations',
        steps: [
          { id: 'step-1', name: 'Fix bug 1', status: 'in_progress' },
          { id: 'step-2', name: 'Fix bug 2', status: 'in_progress' },
          { id: 'step-3', name: 'Fix bug 3', status: 'in_progress' },
          { id: 'step-4', name: 'Run simulation 1', status: 'not_started' },
        ],
      })

      await applyAmendments(amendments)

      // Verify each step was updated exactly once
      expect(mockDatabase.updateTaskStepProgress).toHaveBeenCalledTimes(3)
      expect(mockDatabase.updateTaskStepProgress).toHaveBeenCalledWith('step-1', { status: 'completed' })
      expect(mockDatabase.updateTaskStepProgress).toHaveBeenCalledWith('step-2', { status: 'completed' })
      expect(mockDatabase.updateTaskStepProgress).toHaveBeenCalledWith('step-3', { status: 'completed' })

      // Verify the entire workflow was NOT marked as completed
      expect(mockDatabase.updateSequencedTask).not.toHaveBeenCalled()

      expect(Message.success).toHaveBeenCalledWith('Applied 3 amendments')
    })

    it('should add multiple steps to workflow and wire dependencies', async () => {
      const amendments: StepAddition[] = [
        {
          type: 'step_addition',
          workflowTarget: {
            type: 'workflow',
            id: 'refactor-workflow',
            name: 'Refactoring for bug fix workflow',
            confidence: 0.9,
          },
          stepName: 'Refactoring Part 1',
          duration: 60,
          stepType: 'focused',
          afterStep: 'Verify third simulation results',
        },
        {
          type: 'step_addition',
          workflowTarget: {
            type: 'workflow',
            id: 'refactor-workflow',
            name: 'Refactoring for bug fix workflow',
            confidence: 0.9,
          },
          stepName: 'Refactoring Part 2',
          duration: 60,
          stepType: 'focused',
          afterStep: 'Refactoring Part 1',
        },
      ]

      mockDatabase.addStepToWorkflow.mockResolvedValue({
        id: 'refactor-workflow',
        name: 'Refactoring for bug fix workflow',
        steps: [],
      })

      await applyAmendments(amendments)

      expect(mockDatabase.addStepToWorkflow).toHaveBeenCalledTimes(2)
      expect(mockDatabase.addStepToWorkflow).toHaveBeenNthCalledWith(1, 'refactor-workflow', {
        name: 'Refactoring Part 1',
        duration: 60,
        type: 'focused',
        afterStep: 'Verify third simulation results',
        beforeStep: undefined,
        dependencies: undefined,
        asyncWaitTime: 0,
      })
      expect(mockDatabase.addStepToWorkflow).toHaveBeenNthCalledWith(2, 'refactor-workflow', {
        name: 'Refactoring Part 2',
        duration: 60,
        type: 'focused',
        afterStep: 'Refactoring Part 1',
        beforeStep: undefined,
        dependencies: undefined,
        asyncWaitTime: 0,
      })

      expect(Message.success).toHaveBeenCalledWith('Applied 2 amendments')
    })

    it('should handle partial step name matches', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newStatus: 'completed',
        stepName: 'review', // Partial match for 'Code Review'
      }

      mockDatabase.getSequencedTaskById.mockResolvedValue({
        id: 'wf-1',
        name: 'Test Workflow',
        steps: [
          { id: 'step-1', name: 'Implementation', status: 'completed' },
          { id: 'step-2', name: 'Code Review', status: 'in_progress' },
          { id: 'step-3', name: 'Testing', status: 'not_started' },
        ],
      })

      await applyAmendments([amendment])

      expect(mockDatabase.updateTaskStepProgress).toHaveBeenCalledWith('step-2', { status: 'completed' })
      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
    })

    it('should warn when step is not found in workflow', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newStatus: 'completed',
        stepName: 'Nonexistent Step',
      }

      mockDatabase.getSequencedTaskById.mockResolvedValue({
        id: 'wf-1',
        name: 'Test Workflow',
        steps: [
          { id: 'step-1', name: 'Implementation', status: 'completed' },
        ],
      })

      await applyAmendments([amendment])

      expect(mockDatabase.updateTaskStepProgress).not.toHaveBeenCalled()
      expect(Message.warning).toHaveBeenCalledWith('Step "Nonexistent Step" not found in workflow')
      expect(Message.error).toHaveBeenCalledWith('Failed to apply 1 amendment')
    })

    it('should handle workflow with no steps', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'workflow',
          id: 'wf-1',
          name: 'Empty Workflow',
          confidence: 0.9,
        },
        newStatus: 'completed',
        stepName: 'Some Step',
      }

      mockDatabase.getSequencedTaskById.mockResolvedValue({
        id: 'wf-1',
        name: 'Empty Workflow',
        steps: [],
      })

      await applyAmendments([amendment])

      expect(mockDatabase.updateTaskStepProgress).not.toHaveBeenCalled()
      expect(Message.warning).toHaveBeenCalledWith('Step "Some Step" not found in workflow')
    })
  })

  describe('Error Handling', () => {
    it('should handle unknown amendment types', async () => {
      const unknownAmendment = {
        type: 'unknown_type',
        target: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
      } as any

      await applyAmendments([unknownAmendment])

      expect(Message.error).toHaveBeenCalledWith('Failed to apply 1 amendment')
    })

    it('should continue processing after individual failures', async () => {
      const amendments: Amendment[] = [
        {
          type: 'status_update',
          target: {
            type: 'task',
            name: 'Unknown Task',
            confidence: 0.2,
          },
          newStatus: 'completed',
        },
        {
          type: 'time_log',
          target: {
            type: 'task',
            id: 'task-2',
            name: 'Task 2',
            confidence: 0.9,
          },
          duration: 60,
        },
      ]

      mockDatabase.createWorkSession.mockResolvedValue(true)

      await applyAmendments(amendments)

      expect(mockDatabase.createWorkSession).toHaveBeenCalledTimes(1)
      expect(Message.success).toHaveBeenCalledWith('Applied 1 amendment')
      expect(Message.error).toHaveBeenCalledWith('Failed to apply 1 amendment')
    })
  })

  describe('Deadline Changes', () => {
    it('should update task deadline', async () => {
      const amendment: DeadlineChange = {
        type: AmendmentType.DeadlineChange,
        target: {
          type: EntityType.Task,
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        newDeadline: new Date('2025-09-01T17:00:00'),
        deadlineType: DeadlineType.Hard,
      }

      await applyAmendments([amendment])

      expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-1', {
        deadline: new Date('2025-09-01T17:00:00'),
        deadlineType: 'hard',
      })
      expect(Message.success).toHaveBeenCalledWith('Deadline updated to 9/1/2025, 5:00:00 PM')
    })

    it('should update workflow deadline', async () => {
      const amendment: DeadlineChange = {
        type: AmendmentType.DeadlineChange,
        target: {
          type: EntityType.Workflow,
          id: 'workflow-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newDeadline: new Date('2025-09-01T23:00:00'),
        deadlineType: DeadlineType.Soft,
      }

      await applyAmendments([amendment])

      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('workflow-1', {
        deadline: new Date('2025-09-01T23:00:00'),
        deadlineType: 'soft',
      })
      expect(Message.success).toHaveBeenCalledWith('Deadline updated to 9/1/2025, 11:00:00 PM')
    })

    it('should warn when step deadline is not supported', async () => {
      const amendment: DeadlineChange = {
        type: AmendmentType.DeadlineChange,
        target: {
          type: EntityType.Workflow,
          id: 'workflow-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newDeadline: new Date('2025-09-01T23:00:00'),
        deadlineType: DeadlineType.Soft,
        stepName: 'Some Step',
      }

      await applyAmendments([amendment])

      expect(Message.warning).toHaveBeenCalledWith('Step deadlines are not yet supported')
      expect(mockDatabase.updateSequencedTask).not.toHaveBeenCalled()
    })
  })

  describe('Priority Changes', () => {
    it('should update task priority', async () => {
      const amendment: PriorityChange = {
        type: AmendmentType.PriorityChange,
        target: {
          type: EntityType.Task,
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        importance: 8,
        urgency: 9,
        cognitiveComplexity: 4,
      }

      await applyAmendments([amendment])

      expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-1', {
        importance: 8,
        urgency: 9,
        cognitiveComplexity: 4,
      })
      expect(Message.success).toHaveBeenCalledWith('Priority updated successfully')
    })

    it('should update workflow priority', async () => {
      const amendment: PriorityChange = {
        type: AmendmentType.PriorityChange,
        target: {
          type: EntityType.Workflow,
          id: 'workflow-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        importance: 7,
        urgency: 6,
      }

      await applyAmendments([amendment])

      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('workflow-1', {
        importance: 7,
        urgency: 6,
      })
      expect(Message.success).toHaveBeenCalledWith('Priority updated successfully')
    })

    it('should update step priority', async () => {
      const amendment: PriorityChange = {
        type: AmendmentType.PriorityChange,
        target: {
          type: EntityType.Workflow,
          id: 'workflow-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        importance: 7,
        urgency: 8,
        cognitiveComplexity: 3,
        stepName: 'Some Step',
      }

      const mockWorkflow = {
        id: 'workflow-1',
        steps: [
          { id: 'step-1', name: 'Some Step', duration: 30, type: TaskType.Deep },
        ],
      }
      mockDatabase.getSequencedTaskById.mockResolvedValue(mockWorkflow)

      await applyAmendments([amendment])

      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('workflow-1', {
        steps: [
          { id: 'step-1', name: 'Some Step', duration: 30, type: TaskType.Deep, importance: 7, urgency: 8, cognitiveComplexity: 3 },
        ],
      })
      expect(Message.success).toHaveBeenCalledWith('Updated priority for step "Some Step"')
    })
  })

  describe('Type Changes', () => {
    it('should update task type', async () => {
      const amendment: TypeChange = {
        type: AmendmentType.TypeChange,
        target: {
          type: EntityType.Task,
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        newType: TaskType.Personal,
      }

      await applyAmendments([amendment])

      expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-1', {
        type: TaskType.Personal,
      })
      expect(Message.success).toHaveBeenCalledWith(`Type changed to ${TaskType.Personal}`)
    })

    it('should update workflow type', async () => {
      const amendment: TypeChange = {
        type: AmendmentType.TypeChange,
        target: {
          type: EntityType.Workflow,
          id: 'workflow-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newType: TaskType.Admin,
      }

      await applyAmendments([amendment])

      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('workflow-1', {
        type: TaskType.Admin,
      })
      expect(Message.success).toHaveBeenCalledWith(`Type changed to ${TaskType.Admin}`)
    })

    it('should update step type', async () => {
      const amendment: TypeChange = {
        type: AmendmentType.TypeChange,
        target: {
          type: EntityType.Workflow,
          id: 'workflow-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        newType: TaskType.Deep,
        stepName: 'Review Step',
      }

      const mockWorkflow = {
        id: 'workflow-1',
        steps: [
          { id: 'step-1', name: 'Review Step', duration: 30, type: TaskType.Admin },
        ],
      }
      mockDatabase.getSequencedTaskById.mockResolvedValue(mockWorkflow)

      await applyAmendments([amendment])

      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('workflow-1', {
        steps: [
          { id: 'step-1', name: 'Review Step', duration: 30, type: TaskType.Deep },
        ],
      })
      expect(Message.success).toHaveBeenCalledWith(`Step type changed to ${TaskType.Deep}`)
    })
  })

  describe('Step Removal', () => {
    it('should remove step from workflow', async () => {
      const amendment: StepRemoval = {
        type: AmendmentType.StepRemoval,
        workflowTarget: {
          type: EntityType.Workflow,
          id: 'workflow-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        stepName: 'Review Step',
      }

      const mockWorkflow = {
        id: 'workflow-1',
        steps: [
          { id: 'step-1', name: 'Build Step', duration: 30, type: TaskType.Deep, dependsOn: [], stepIndex: 0 },
          { id: 'step-2', name: 'Review Step', duration: 20, type: TaskType.Admin, dependsOn: ['step-1'], stepIndex: 1 },
          { id: 'step-3', name: 'Deploy Step', duration: 15, type: TaskType.Admin, dependsOn: ['step-2'], stepIndex: 2 },
        ],
      }
      mockDatabase.getSequencedTaskById.mockResolvedValue(mockWorkflow)

      await applyAmendments([amendment])

      const expectedSteps = [
        { id: 'step-1', name: 'Build Step', duration: 30, type: TaskType.Deep, dependsOn: [], stepIndex: 0 },
        { id: 'step-3', name: 'Deploy Step', duration: 15, type: TaskType.Admin, dependsOn: [], stepIndex: 1 },
      ]
      expect(mockDatabase.updateSequencedTask).toHaveBeenCalledWith('workflow-1', {
        steps: expectedSteps,
        duration: 45,
      })
      expect(Message.success).toHaveBeenCalledWith('Removed step "Review Step"')
    })

    it('should handle step not found', async () => {
      const amendment: StepRemoval = {
        type: AmendmentType.StepRemoval,
        workflowTarget: {
          type: EntityType.Workflow,
          id: 'workflow-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        stepName: 'Non-existent Step',
      }

      const mockWorkflow = {
        id: 'workflow-1',
        steps: [
          { id: 'step-1', name: 'Build Step', duration: 30, type: TaskType.Deep },
        ],
      }
      mockDatabase.getSequencedTaskById.mockResolvedValue(mockWorkflow)

      await applyAmendments([amendment])

      expect(mockDatabase.updateSequencedTask).not.toHaveBeenCalled()
      expect(Message.warning).toHaveBeenCalledWith('Step "Non-existent Step" not found in workflow')
    })

    it('should handle workflow not found', async () => {
      const amendment: StepRemoval = {
        type: AmendmentType.StepRemoval,
        workflowTarget: {
          type: EntityType.Workflow,
          id: 'workflow-1',
          name: 'Test Workflow',
          confidence: 0.9,
        },
        stepName: 'Some Step',
      }

      mockDatabase.getSequencedTaskById.mockResolvedValue(null)

      await applyAmendments([amendment])

      expect(mockDatabase.updateSequencedTask).not.toHaveBeenCalled()
      expect(Message.warning).toHaveBeenCalledWith('Workflow not found or has no steps')
    })
  })

  describe('Event Emissions', () => {
    it('should emit refresh events after successful amendments', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          confidence: 0.9,
        },
        newStatus: 'completed',
      }

      mockDatabase.updateTask.mockResolvedValue(true)

      await applyAmendments([amendment])

      // Verify all three refresh events were emitted
      expect(mockAppEvents.emit).toHaveBeenCalledWith('DATA_REFRESH_NEEDED')
      expect(mockAppEvents.emit).toHaveBeenCalledWith('TASK_UPDATED')
      expect(mockAppEvents.emit).toHaveBeenCalledWith('WORKFLOW_UPDATED')
      expect(mockAppEvents.emit).toHaveBeenCalledTimes(3)
    })

    it('should not emit events when all amendments fail', async () => {
      const amendment: StatusUpdate = {
        type: 'status_update',
        target: {
          type: 'task',
          name: 'Unknown Task',
          confidence: 0.5,
        },
        newStatus: 'completed',
      }

      await applyAmendments([amendment])

      // No events should be emitted on complete failure
      expect(mockAppEvents.emit).not.toHaveBeenCalled()
      expect(Message.error).toHaveBeenCalledWith('Failed to apply 1 amendment')
    })
  })
})
