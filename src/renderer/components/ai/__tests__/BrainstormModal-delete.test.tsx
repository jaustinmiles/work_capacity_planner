import { describe, it, expect, beforeEach } from 'vitest'
import { TaskType } from '@shared/enums'
import { deleteWorkflow, deleteTask, deleteStep } from '../../../utils/brainstorm-utils'

describe('BrainstormModal - Delete Functionality', () => {
  beforeEach(() => {
    // Reset any test state if needed
  })

  describe('deleteWorkflow', () => {
    it('should remove workflow from result at specified index', () => {
      const mockWorkflows = [
        {
          name: 'Workflow 1',
          description: 'First workflow',
          importance: 5,
          urgency: 5,
          type: TaskType.Focused,
          steps: [],
          totalDuration: 60,
          earliestCompletion: '2024-01-01',
          worstCaseCompletion: '2024-01-02',
          notes: 'Notes',
        },
        {
          name: 'Workflow 2',
          description: 'Second workflow',
          importance: 5,
          urgency: 5,
          type: TaskType.Focused,
          steps: [],
          totalDuration: 60,
          earliestCompletion: '2024-01-01',
          worstCaseCompletion: '2024-01-02',
          notes: 'Notes',
        },
      ]

      const result = {
        summary: 'Test summary',
        workflows: [...mockWorkflows],
        standaloneTasks: [],
      }

      // Delete the first workflow (index 0)
      const newResult = deleteWorkflow(result, 0)

      expect(newResult).toBeTruthy()
      expect(newResult?.workflows).toHaveLength(1)
      expect(newResult?.workflows?.[0].name).toBe('Workflow 2')
    })

    it('should handle deleting the last workflow', () => {
      const result = {
        summary: 'Test summary',
        workflows: [
          {
            name: 'Only Workflow',
            description: 'Single workflow',
            importance: 5,
            urgency: 5,
            type: TaskType.Focused,
            steps: [],
            totalDuration: 60,
            earliestCompletion: '2024-01-01',
            worstCaseCompletion: '2024-01-02',
            notes: 'Notes',
          },
        ],
        standaloneTasks: [],
      }

      const newResult = deleteWorkflow(result, 0)

      expect(newResult?.workflows).toHaveLength(0)
    })

    it('should return original result if workflows array is missing', () => {
      const result = {
        summary: 'Test summary',
        standaloneTasks: [],
      }

      const newResult = deleteWorkflow(result, 0)

      expect(newResult).toBe(result)
    })

    it('should return original result if result is null', () => {
      const newResult = deleteWorkflow(null, 0)

      expect(newResult).toBeNull()
    })
  })

  describe('deleteTask', () => {
    it('should remove task from result at specified index', () => {
      const mockTasks = [
        {
          name: 'Task 1',
          description: 'First task',
          estimatedDuration: 30,
          importance: 5,
          urgency: 5,
          type: TaskType.Focused,
        },
        {
          name: 'Task 2',
          description: 'Second task',
          estimatedDuration: 30,
          importance: 5,
          urgency: 5,
          type: TaskType.Focused,
        },
        {
          name: 'Task 3',
          description: 'Third task',
          estimatedDuration: 30,
          importance: 5,
          urgency: 5,
          type: TaskType.Focused,
        },
      ]

      const result = {
        summary: 'Test summary',
        tasks: [...mockTasks],
      }

      // Delete the middle task (index 1)
      const newResult = deleteTask(result, 1)

      expect(newResult?.tasks).toHaveLength(2)
      expect(newResult?.tasks?.[0].name).toBe('Task 1')
      expect(newResult?.tasks?.[1].name).toBe('Task 3')
    })

    it('should handle deleting all tasks sequentially', () => {
      let result = {
        summary: 'Test summary',
        tasks: [
          {
            name: 'Task 1',
            description: 'First task',
            estimatedDuration: 30,
            importance: 5,
            urgency: 5,
            type: TaskType.Focused,
          },
          {
            name: 'Task 2',
            description: 'Second task',
            estimatedDuration: 30,
            importance: 5,
            urgency: 5,
            type: TaskType.Focused,
          },
        ],
      }

      // Delete first task
      result = deleteTask(result, 0) as any
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].name).toBe('Task 2')

      // Delete second task
      result = deleteTask(result, 0) as any
      expect(result.tasks).toHaveLength(0)
    })

    it('should return original result if tasks array is missing', () => {
      const result = {
        summary: 'Test summary',
      }

      const newResult = deleteTask(result, 0)

      expect(newResult).toBe(result)
    })

    it('should return original result if result is null', () => {
      const newResult = deleteTask(null, 0)

      expect(newResult).toBeNull()
    })
  })

  describe('deleteStep', () => {
    it('should remove step from workflow and recalculate duration', () => {
      const result = {
        summary: 'Test summary',
        workflows: [
          {
            name: 'Workflow with steps',
            description: 'Workflow description',
            importance: 5,
            urgency: 5,
            type: TaskType.Focused,
            steps: [
              { name: 'Step 1', duration: 20, asyncWaitTime: 0 },
              { name: 'Step 2', duration: 30, asyncWaitTime: 10 },
              { name: 'Step 3', duration: 25, asyncWaitTime: 0 },
            ],
            totalDuration: 85, // 20 + 30 + 10 + 25
            earliestCompletion: '2024-01-01',
            worstCaseCompletion: '2024-01-02',
            notes: 'Notes',
          },
        ],
        standaloneTasks: [],
      }

      // Delete step at index 1 (Step 2: 30 + 10 = 40 duration)
      const newResult = deleteStep(result, 0, 1)

      expect(newResult?.workflows?.[0].steps).toHaveLength(2)
      expect(newResult?.workflows?.[0].steps[0].name).toBe('Step 1')
      expect(newResult?.workflows?.[0].steps[1].name).toBe('Step 3')
      // New duration should be 20 + 25 = 45
      expect(newResult?.workflows?.[0].totalDuration).toBe(45)
    })

    it('should handle deleting all steps from a workflow', () => {
      const result = {
        summary: 'Test summary',
        workflows: [
          {
            name: 'Workflow with one step',
            description: 'Workflow description',
            importance: 5,
            urgency: 5,
            type: TaskType.Focused,
            steps: [{ name: 'Only Step', duration: 60, asyncWaitTime: 0 }],
            totalDuration: 60,
            earliestCompletion: '2024-01-01',
            worstCaseCompletion: '2024-01-02',
            notes: 'Notes',
          },
        ],
        standaloneTasks: [],
      }

      const newResult = deleteStep(result, 0, 0)

      expect(newResult?.workflows?.[0].steps).toHaveLength(0)
      expect(newResult?.workflows?.[0].totalDuration).toBe(0)
    })

    it('should handle deleting steps from different workflows', () => {
      const result = {
        summary: 'Test summary',
        workflows: [
          {
            name: 'Workflow 1',
            description: 'First workflow',
            importance: 5,
            urgency: 5,
            type: TaskType.Focused,
            steps: [
              { name: 'W1 Step 1', duration: 20, asyncWaitTime: 0 },
              { name: 'W1 Step 2', duration: 20, asyncWaitTime: 0 },
            ],
            totalDuration: 40,
            earliestCompletion: '2024-01-01',
            worstCaseCompletion: '2024-01-02',
            notes: 'Notes',
          },
          {
            name: 'Workflow 2',
            description: 'Second workflow',
            importance: 5,
            urgency: 5,
            type: TaskType.Focused,
            steps: [
              { name: 'W2 Step 1', duration: 30, asyncWaitTime: 0 },
              { name: 'W2 Step 2', duration: 30, asyncWaitTime: 0 },
            ],
            totalDuration: 60,
            earliestCompletion: '2024-01-01',
            worstCaseCompletion: '2024-01-02',
            notes: 'Notes',
          },
        ],
        standaloneTasks: [],
      }

      // Delete first step from first workflow
      let newResult = deleteStep(result, 0, 0)
      expect(newResult?.workflows?.[0].steps).toHaveLength(1)
      expect(newResult?.workflows?.[0].steps[0].name).toBe('W1 Step 2')
      expect(newResult?.workflows?.[0].totalDuration).toBe(20)

      // Delete first step from second workflow
      newResult = deleteStep(newResult, 1, 0)
      expect(newResult?.workflows?.[1].steps).toHaveLength(1)
      expect(newResult?.workflows?.[1].steps[0].name).toBe('W2 Step 2')
      expect(newResult?.workflows?.[1].totalDuration).toBe(30)
    })

    it('should return original result if workflows array is missing', () => {
      const result = {
        summary: 'Test summary',
        standaloneTasks: [],
      }

      const newResult = deleteStep(result, 0, 0)

      expect(newResult).toBe(result)
    })

    it('should return original result if result is null', () => {
      const newResult = deleteStep(null, 0, 0)

      expect(newResult).toBeNull()
    })

    it('should handle invalid workflow index gracefully', () => {
      const result = {
        summary: 'Test summary',
        workflows: [
          {
            name: 'Workflow 1',
            description: 'First workflow',
            importance: 5,
            urgency: 5,
            type: TaskType.Focused,
            steps: [{ name: 'Step 1', duration: 20, asyncWaitTime: 0 }],
            totalDuration: 20,
            earliestCompletion: '2024-01-01',
            worstCaseCompletion: '2024-01-02',
            notes: 'Notes',
          },
        ],
        standaloneTasks: [],
      }

      // Try to delete from workflow at index 999 (doesn't exist)
      const newResult = deleteStep(result, 999, 0)

      // Should return result unchanged
      expect(newResult?.workflows?.[0].steps).toHaveLength(1)
      expect(newResult?.workflows?.[0].totalDuration).toBe(20)
    })
  })

  describe('Edge Cases', () => {
    it('should handle deleting from empty workflows array', () => {
      const result = {
        summary: 'Test summary',
        workflows: [],
        standaloneTasks: [],
      }

      const newResult = deleteWorkflow(result, 0)

      expect(newResult?.workflows).toHaveLength(0)
    })

    it('should handle deleting from empty tasks array', () => {
      const result = {
        summary: 'Test summary',
        tasks: [],
      }

      const newResult = deleteTask(result, 0)

      expect(newResult?.tasks).toHaveLength(0)
    })

    it('should handle deleting with out-of-bounds index', () => {
      const result = {
        summary: 'Test summary',
        tasks: [
          {
            name: 'Task 1',
            description: 'First task',
            estimatedDuration: 30,
            importance: 5,
            urgency: 5,
            type: TaskType.Focused,
          },
        ],
      }

      // Try to delete with index that doesn't exist
      const newResult = deleteTask(result, 999)

      // Should return all original tasks since index doesn't match
      expect(newResult?.tasks).toHaveLength(1)
      expect(newResult?.tasks?.[0].name).toBe('Task 1')
    })
  })
})
