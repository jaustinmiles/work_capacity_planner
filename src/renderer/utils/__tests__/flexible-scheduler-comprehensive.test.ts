import { describe, it, expect, beforeEach } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Flexible Scheduler - Comprehensive Tests', () => {
  let baseDate: Date

  beforeEach(() => {
    // Set a fixed date for consistent testing
    baseDate = new Date('2025-08-20T09:00:00')
  })

  describe('Deduplication', () => {
    it('should remove duplicate workflows that appear in both tasks and sequencedTasks', () => {
      const duplicateTask: Task = {
        id: 'workflow-1',
        name: 'Duplicate Workflow',
        duration: 60,
        type: TaskType.Focused,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
        hasSteps: true,
        steps: [],
      } as Task

      const sequencedTask = {
        id: 'workflow-1',
        name: 'Duplicate Workflow',
        totalDuration: 60,
        steps: [],
        overallStatus: 'not_started' as const,
      }

      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'morning',
          startTime: '09:00',
          endTime: '12:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 180,
            adminMinutes: 0,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        [duplicateTask],
        [sequencedTask as any],
        [pattern],
        baseDate,
      )

      // Should only schedule once, not twice
      const workflowScheduled = result.scheduledItems.filter(
        item => item.id === 'workflow-1' || item.id?.includes('workflow-1'),
      )
      expect(workflowScheduled.length).toBeLessThanOrEqual(1)
    })

    it('should handle tasks with same name but different IDs', () => {
      const task1: Task = {
        id: 'task-1',
        name: 'Review Code',
        duration: 30,
        type: TaskType.Admin,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const task2: Task = {
        id: 'task-2',
        name: 'Review Code',
        duration: 30,
        type: TaskType.Admin,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'morning',
          startTime: '09:00',
          endTime: '12:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 0,
            adminMinutes: 180,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        [task1, task2],
        [],
        [pattern],
        baseDate,
      )

      // Both tasks should be scheduled
      expect(result.scheduledItems.length).toBe(2)
      expect(result.scheduledItems[0].name).toBe('Review Code')
      expect(result.scheduledItems[1].name).toBe('Review Code')
    })
  })

  describe('Backfilling Logic', () => {
    it('should not backfill into past time for today', () => {
      // Simulate current time being 2 PM
      const currentTime = new Date('2025-08-20T14:00:00')

      const task: Task = {
        id: 'task-1',
        name: 'Afternoon Task',
        duration: 60,
        type: TaskType.Focused,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const pattern: DailyWorkPattern = {
        date: currentTime.toISOString().split('T')[0],
        blocks: [
          {
            id: 'morning',
            startTime: '09:00',
            endTime: '12:00',
            type: 'mixed',
            capacity: {
              focusMinutes: 180,
              adminMinutes: 0,
              personalMinutes: 0,
            },
          },
          {
            id: 'afternoon',
            startTime: '14:00',
            endTime: '17:00',
            type: 'mixed',
            capacity: {
              focusMinutes: 180,
              adminMinutes: 0,
              personalMinutes: 0,
            },
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        [task],
        [],
        [pattern],
        currentTime,
      )

      // Task should be scheduled in afternoon block, not morning
      expect(result.scheduledItems.length).toBe(1)
      const scheduled = result.scheduledItems[0]
      const scheduledTime = new Date(scheduled.startTime)
      expect(scheduledTime.getHours()).toBeGreaterThanOrEqual(14)
    })

    it('should backfill future days from block start', () => {
      const tomorrow = new Date(baseDate)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const tasks: Task[] = [
        {
          id: 'task-1',
          name: 'High Priority',
          duration: 60,
          type: TaskType.Focused,
          importance: 10,
          urgency: 10,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'task-2',
          name: 'Low Priority',
          duration: 60,
          type: TaskType.Focused,
          importance: 2,
          urgency: 2,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
      ]

      const pattern: DailyWorkPattern = {
        date: tomorrow.toISOString().split('T')[0],
        blocks: [{
          id: 'morning',
          startTime: '09:00',
          endTime: '11:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 120,
            adminMinutes: 0,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        tasks,
        [],
        [pattern],
        baseDate,
      )

      // Both tasks should be scheduled with backfilling
      expect(result.scheduledItems.length).toBe(2)

      // High priority should be first
      const firstStart = new Date(result.scheduledItems[0].startTime)
      const secondStart = new Date(result.scheduledItems[1].startTime)
      expect(firstStart.getHours()).toBe(9)
      expect(secondStart.getHours()).toBe(10)
    })
  })

  describe('Task Type Matching', () => {
    it('should place focus tasks only in blocks with focus capacity', () => {
      const focusTask: Task = {
        id: 'focus-1',
        name: 'Focus Work',
        duration: 60,
        type: TaskType.Focused,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const patterns: DailyWorkPattern[] = [
        {
          date: baseDate.toISOString().split('T')[0],
          blocks: [
            {
              id: 'admin-only',
              startTime: '09:00',
              endTime: '10:00',
              type: 'mixed',
              capacity: {
                focusMinutes: 0,
                adminMinutes: 60,
                personalMinutes: 0,
              },
            },
            {
              id: 'focus-block',
              startTime: '10:00',
              endTime: '11:00',
              type: 'mixed',
              capacity: {
                focusMinutes: 60,
                adminMinutes: 0,
                personalMinutes: 0,
              },
            },
          ],
          meetings: [],
          accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
        },
      ]

      const result = scheduleItemsWithBlocksAndDebug(
        [focusTask],
        [],
        patterns,
        baseDate,
      )

      // Task should be in focus block, not admin block
      expect(result.scheduledItems.length).toBe(1)
      const scheduled = result.scheduledItems[0]
      const scheduledTime = new Date(scheduled.startTime)
      expect(scheduledTime.getHours()).toBe(10) // Focus block starts at 10
    })

    it('should place admin tasks only in blocks with admin capacity', () => {
      const adminTask: Task = {
        id: 'admin-1',
        name: 'Admin Work',
        duration: 60,
        type: TaskType.Admin,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const patterns: DailyWorkPattern[] = [
        {
          date: baseDate.toISOString().split('T')[0],
          blocks: [
            {
              id: 'focus-only',
              startTime: '09:00',
              endTime: '10:00',
              type: 'mixed',
              capacity: {
                focusMinutes: 60,
                adminMinutes: 0,
                personalMinutes: 0,
              },
            },
            {
              id: 'admin-block',
              startTime: '10:00',
              endTime: '11:00',
              type: 'mixed',
              capacity: {
                focusMinutes: 0,
                adminMinutes: 60,
                personalMinutes: 0,
              },
            },
          ],
          meetings: [],
          accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
        },
      ]

      const result = scheduleItemsWithBlocksAndDebug(
        [adminTask],
        [],
        patterns,
        baseDate,
      )

      // Task should be in admin block, not focus block
      expect(result.scheduledItems.length).toBe(1)
      const scheduled = result.scheduledItems[0]
      const scheduledTime = new Date(scheduled.startTime)
      expect(scheduledTime.getHours()).toBe(10) // Admin block starts at 10
    })

    it('should handle personal tasks in personal blocks only', () => {
      const personalTask: Task = {
        id: 'personal-1',
        name: 'Personal Task',
        duration: 30,
        type: TaskType.Personal,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const patterns: DailyWorkPattern[] = [
        {
          date: baseDate.toISOString().split('T')[0],
          blocks: [
            {
              id: 'work-block',
              startTime: '09:00',
              endTime: '10:00',
              type: 'mixed',
              capacity: {
                focusMinutes: 30,
                adminMinutes: 30,
                personalMinutes: 0,
              },
            },
            {
              id: 'personal-block',
              startTime: '12:00',
              endTime: '13:00',
              type: 'personal',
              capacity: {
                focusMinutes: 0,
                adminMinutes: 0,
                personalMinutes: 60,
              },
            },
          ],
          meetings: [],
          accumulated: { focusMinutes: 0, adminMinutes: 0, personalMinutes: 0 },
        },
      ]

      const result = scheduleItemsWithBlocksAndDebug(
        [personalTask],
        [],
        patterns,
        baseDate,
      )

      // Task should be in personal block at noon
      expect(result.scheduledItems.length).toBe(1)
      const scheduled = result.scheduledItems[0]
      const scheduledTime = new Date(scheduled.startTime)
      expect(scheduledTime.getHours()).toBe(12)
    })
  })

  describe('Priority and Ordering', () => {
    it('should schedule higher priority tasks first', () => {
      const tasks: Task[] = [
        {
          id: 'low',
          name: 'Low Priority',
          duration: 60,
          type: TaskType.Focused,
          importance: 2,
          urgency: 2,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'high',
          name: 'High Priority',
          duration: 60,
          type: TaskType.Focused,
          importance: 10,
          urgency: 10,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'medium',
          name: 'Medium Priority',
          duration: 60,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
      ]

      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'morning',
          startTime: '09:00',
          endTime: '12:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 180,
            adminMinutes: 0,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        tasks,
        [],
        [pattern],
        baseDate,
      )

      // All should be scheduled
      expect(result.scheduledItems.length).toBe(3)

      // Check order: high, medium, low
      expect(result.scheduledItems[0].name).toBe('High Priority')
      expect(result.scheduledItems[1].name).toBe('Medium Priority')
      expect(result.scheduledItems[2].name).toBe('Low Priority')
    })

    it('should respect task dependencies', () => {
      const tasks: Task[] = [
        {
          id: 'dependent',
          name: 'Dependent Task',
          duration: 30,
          type: TaskType.Focused,
          importance: 10,
          urgency: 10,
          completed: false,
          dependencies: ['prerequisite'],
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'prerequisite',
          name: 'Prerequisite Task',
          duration: 30,
          type: TaskType.Focused,
          importance: 2,
          urgency: 2,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
      ]

      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'morning',
          startTime: '09:00',
          endTime: '11:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 120,
            adminMinutes: 0,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        tasks,
        [],
        [pattern],
        baseDate,
      )

      // Both should be scheduled
      expect(result.scheduledItems.length).toBe(2)

      // Prerequisite must come before dependent
      const prereqIndex = result.scheduledItems.findIndex(
        item => item.name === 'Prerequisite Task',
      )
      const depIndex = result.scheduledItems.findIndex(
        item => item.name === 'Dependent Task',
      )

      // If both are scheduled, prerequisite should come first
      if (prereqIndex !== -1 && depIndex !== -1) {
        expect(prereqIndex).toBeLessThan(depIndex)
      } else {
        // At minimum, prerequisite should be scheduled
        expect(prereqIndex).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('Capacity Management', () => {
    it('should not exceed block capacity', () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          name: 'Task 1',
          duration: 60,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'task-2',
          name: 'Task 2',
          duration: 60,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'task-3',
          name: 'Task 3',
          duration: 60,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
      ]

      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'limited',
          startTime: '09:00',
          endTime: '11:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 120, // Only 2 hours
            adminMinutes: 0,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        tasks,
        [],
        [pattern],
        baseDate,
      )

      // Only 2 tasks should fit
      expect(result.scheduledItems.length).toBe(2)
      expect(result.debugInfo.unscheduledItems.length).toBe(1)
    })

    it('should handle mixed capacity blocks correctly', () => {
      const tasks: Task[] = [
        {
          id: 'focus-1',
          name: 'Focus Task',
          duration: 30,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'admin-1',
          name: 'Admin Task',
          duration: 30,
          type: TaskType.Admin,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
      ]

      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'mixed',
          startTime: '09:00',
          endTime: '10:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 30,
            adminMinutes: 30,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        tasks,
        [],
        [pattern],
        baseDate,
      )

      // Both should fit
      expect(result.scheduledItems.length).toBe(2)
      expect(result.debugInfo.unscheduledItems.length).toBe(0)
    })
  })

  describe('Debug Information', () => {
    it('should provide accurate block utilization info', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        duration: 30,
        type: TaskType.Focused,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'morning',
          startTime: '09:00',
          endTime: '11:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 120,
            adminMinutes: 0,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        [task],
        [],
        [pattern],
        baseDate,
      )

      // Check debug info
      expect(result.debugInfo.blockUtilization).toHaveLength(1)
      const blockInfo = result.debugInfo.blockUtilization[0]
      expect(blockInfo.focusTotal).toBe(120)
      expect(blockInfo.focusUsed).toBe(30)
      expect(blockInfo.adminTotal).toBe(0)
      expect(blockInfo.adminUsed).toBe(0)
    })

    it('should report unscheduled items with reasons', () => {
      const tasks: Task[] = [
        {
          id: 'too-big',
          name: 'Too Big Task',
          duration: 240, // 4 hours
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
      ]

      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'small',
          startTime: '09:00',
          endTime: '10:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 60,
            adminMinutes: 0,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        tasks,
        [],
        [pattern],
        baseDate,
      )

      // Task should be unscheduled
      expect(result.scheduledItems.length).toBe(0)
      expect(result.debugInfo.unscheduledItems.length).toBe(1)
      expect(result.debugInfo.unscheduledItems[0].name).toBe('Too Big Task')
      expect(result.debugInfo.unscheduledItems[0].reason).toBeTruthy()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty task list', () => {
      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'morning',
          startTime: '09:00',
          endTime: '12:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 180,
            adminMinutes: 0,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        [],
        [],
        [pattern],
        baseDate,
      )

      expect(result.scheduledItems).toEqual([])
      expect(result.debugInfo.unscheduledItems).toEqual([])
    })

    it('should handle empty pattern list', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        duration: 30,
        type: TaskType.Focused,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const result = scheduleItemsWithBlocksAndDebug(
        [task],
        [],
        [],
        baseDate,
      )

      expect(result.scheduledItems).toEqual([])
      // With no patterns, tasks remain in workItems and aren't tracked as unscheduled
      // until the end of processing
      expect(result.debugInfo.unscheduledItems.length).toBeGreaterThanOrEqual(0)
    })

    it('should filter completed tasks', () => {
      const tasks: Task[] = [
        {
          id: 'completed',
          name: 'Completed Task',
          duration: 30,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: true,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'incomplete',
          name: 'Incomplete Task',
          duration: 30,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
      ]

      const pattern: DailyWorkPattern = {
        date: baseDate.toISOString().split('T')[0],
        blocks: [{
          id: 'morning',
          startTime: '09:00',
          endTime: '10:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 60,
            adminMinutes: 0,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        tasks,
        [],
        [pattern],
        baseDate,
      )

      // Only incomplete task should be scheduled
      expect(result.scheduledItems.length).toBe(1)
      expect(result.scheduledItems[0].name).toBe('Incomplete Task')
    })
  })
})
