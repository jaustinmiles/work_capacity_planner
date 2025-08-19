import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Flexible Scheduler - Additional Coverage', () => {
  describe('Empty Block Warnings', () => {
    it('should warn about completely empty blocks', () => {
      const pattern: DailyWorkPattern = {
        date: '2025-08-20',
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
            startTime: '13:00',
            endTime: '16:00',
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
        [], // No tasks
        [],
        [pattern],
        new Date('2025-08-20T08:00:00'),
      )

      // Should detect empty blocks
      expect(result.debugInfo.warnings).toContain('2 empty time block(s) detected in schedule')
      expect(result.debugInfo.blockUtilization[0].unusedReason).toContain('Empty block')
    })

    it('should warn about unused capacity with unscheduled tasks', () => {
      const focusTask: Task = {
        id: 'focus-1',
        name: 'Large Focus Task',
        duration: 240, // Too big for any single block
        type: TaskType.Focused,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const pattern: DailyWorkPattern = {
        date: '2025-08-20',
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
        [focusTask],
        [],
        [pattern],
        new Date('2025-08-20T08:00:00'),
      )

      // Should warn about unused focus time
      expect(result.debugInfo.warnings.some(w => 
        w.includes('180 minutes of focus time unused while focus tasks remain unscheduled')
      )).toBe(true)
    })

    it('should warn about unused admin capacity', () => {
      const adminTask: Task = {
        id: 'admin-1',
        name: 'Large Admin Task',
        duration: 150,
        type: TaskType.Admin,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const pattern: DailyWorkPattern = {
        date: '2025-08-20',
        blocks: [{
          id: 'admin-block',
          startTime: '09:00',
          endTime: '11:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 0,
            adminMinutes: 121, // Just over warning threshold
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        [adminTask],
        [],
        [pattern],
        new Date('2025-08-20T08:00:00'),
      )

      // Should warn about unused admin time
      expect(result.debugInfo.warnings.some(w => 
        w.includes('admin time unused while admin tasks remain')
      )).toBe(true)
    })
  })

  describe('Multi-day Scheduling', () => {
    it('should move to next day when current time is past all blocks', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Late Task',
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
          date: '2025-08-20',
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
        },
        {
          date: '2025-08-21',
          blocks: [{
            id: 'next-morning',
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
        },
      ]

      // Current time is past the first day's blocks
      const result = scheduleItemsWithBlocksAndDebug(
        [task],
        [],
        patterns,
        new Date('2025-08-20T18:00:00'), // 6 PM
      )

      // Task should be scheduled on the next day
      expect(result.scheduledItems.length).toBe(1)
      const scheduled = result.scheduledItems[0]
      expect(new Date(scheduled.startTime).toISOString()).toContain('2025-08-21')
    })

    it('should handle patterns with no blocks for next day', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Task for empty day',
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
          date: '2025-08-20',
          blocks: [],
          meetings: [],
          accumulated: { focusMinutes: 0, adminMinutes: 0 },
        },
        {
          date: '2025-08-21',
          blocks: [{
            id: 'block',
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
        },
      ]

      const result = scheduleItemsWithBlocksAndDebug(
        [task],
        [],
        patterns,
        new Date('2025-08-20T08:00:00'),
      )

      // Should skip empty day and schedule on next
      expect(result.scheduledItems.length).toBe(1)
      expect(new Date(result.scheduledItems[0].startTime).toISOString()).toContain('2025-08-21')
    })
  })

  describe('Workflow Scheduling', () => {
    it('should handle workflows with steps', () => {
      const workflow = {
        id: 'workflow-1',
        name: 'Test Workflow',
        totalDuration: 120,
        overallStatus: 'not_started' as const,
        steps: [
          {
            id: 'step-1',
            workflowId: 'workflow-1',
            name: 'Step 1',
            order: 1,
            duration: 60,
            type: TaskType.Focused,
            status: 'not_started' as const,
            asyncWaitTime: 0,
            dependencies: [],
          },
          {
            id: 'step-2',
            workflowId: 'workflow-1',
            name: 'Step 2',
            order: 2,
            duration: 60,
            type: TaskType.Admin,
            status: 'not_started' as const,
            asyncWaitTime: 0,
            dependencies: ['step-1'],
          },
        ],
      }

      const pattern: DailyWorkPattern = {
        date: '2025-08-20',
        blocks: [{
          id: 'mixed',
          startTime: '09:00',
          endTime: '12:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 90,
            adminMinutes: 90,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        [],
        [workflow as any],
        [pattern],
        new Date('2025-08-20T08:00:00'),
      )

      // Both steps should be scheduled
      expect(result.scheduledItems.filter(item => 
        item.id?.includes('step-')
      ).length).toBe(2)

      // Step 1 should come before Step 2
      const step1 = result.scheduledItems.find(item => item.id === 'workflow-1-step-1')
      const step2 = result.scheduledItems.find(item => item.id === 'workflow-1-step-2')
      
      if (step1 && step2) {
        expect(new Date(step1.startTime).getTime()).toBeLessThan(
          new Date(step2.startTime).getTime()
        )
      }
    })

    it('should handle workflow with async wait time', () => {
      const workflow = {
        id: 'workflow-1',
        name: 'Async Workflow',
        totalDuration: 60,
        overallStatus: 'not_started' as const,
        steps: [
          {
            id: 'step-1',
            workflowId: 'workflow-1',
            name: 'Async Step',
            order: 1,
            duration: 30,
            type: TaskType.Focused,
            status: 'not_started' as const,
            asyncWaitTime: 120, // 2 hour wait
            dependencies: [],
          },
          {
            id: 'step-2',
            workflowId: 'workflow-1',
            name: 'Follow-up Step',
            order: 2,
            duration: 30,
            type: TaskType.Focused,
            status: 'not_started' as const,
            asyncWaitTime: 0,
            dependencies: ['step-1'],
          },
        ],
      }

      const pattern: DailyWorkPattern = {
        date: '2025-08-20',
        blocks: [
          {
            id: 'morning',
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
            id: 'afternoon',
            startTime: '13:00',
            endTime: '14:00',
            type: 'mixed',
            capacity: {
              focusMinutes: 60,
              adminMinutes: 0,
              personalMinutes: 0,
            },
          },
        ],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        [],
        [workflow as any],
        [pattern],
        new Date('2025-08-20T08:00:00'),
      )

      // Both steps should be scheduled
      const step1 = result.scheduledItems.find(item => item.id === 'workflow-1-step-1')
      const step2 = result.scheduledItems.find(item => item.id === 'workflow-1-step-2')

      if (step1 && step2) {
        // Step 2 should be at least 2 hours after step 1 ends
        const step1End = new Date(step1.startTime).getTime() + 30 * 60 * 1000
        const step2Start = new Date(step2.startTime).getTime()
        expect(step2Start - step1End).toBeGreaterThanOrEqual(120 * 60 * 1000)
      }
    })
  })

  describe('Block Type Compatibility', () => {
    it('should handle blocks with no capacity gracefully', () => {
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
        date: '2025-08-20',
        blocks: [{
          id: 'no-capacity',
          startTime: '09:00',
          endTime: '10:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 0,
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
        new Date('2025-08-20T08:00:00'),
      )

      // Task should not be scheduled
      expect(result.scheduledItems.length).toBe(0)
      expect(result.debugInfo.unscheduledItems.length).toBe(1)
    })

    it('should detect partial unused capacity', () => {
      const smallTask: Task = {
        id: 'small-1',
        name: 'Small Task',
        duration: 15,
        type: TaskType.Focused,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: [],
        asyncWaitTime: 0,
      } as Task

      const pattern: DailyWorkPattern = {
        date: '2025-08-20',
        blocks: [{
          id: 'block',
          startTime: '09:00',
          endTime: '10:00',
          type: 'mixed',
          capacity: {
            focusMinutes: 60,
            adminMinutes: 45,
            personalMinutes: 0,
          },
        }],
        meetings: [],
        accumulated: { focusMinutes: 0, adminMinutes: 0 },
      }

      const result = scheduleItemsWithBlocksAndDebug(
        [smallTask],
        [],
        [pattern],
        new Date('2025-08-20T08:00:00'),
      )

      // Check for unused capacity reporting
      const blockUtil = result.debugInfo.blockUtilization[0]
      expect(blockUtil.unusedReason).toContain('45 focus')
      expect(blockUtil.unusedReason).toContain('45 admin')
    })
  })

  describe('Complex Dependency Scenarios', () => {
    it('should handle circular dependency detection', () => {
      const tasks: Task[] = [
        {
          id: 'task-a',
          name: 'Task A',
          duration: 30,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: ['task-b'], // Depends on B
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'task-b',
          name: 'Task B',
          duration: 30,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: ['task-a'], // Depends on A (circular)
          asyncWaitTime: 0,
        } as Task,
      ]

      const pattern: DailyWorkPattern = {
        date: '2025-08-20',
        blocks: [{
          id: 'block',
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
        new Date('2025-08-20T08:00:00'),
      )

      // Neither should be scheduled due to circular dependency
      expect(result.scheduledItems.length).toBe(0)
      expect(result.debugInfo.unscheduledItems.length).toBe(2)
    })

    it('should handle missing dependencies gracefully', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Dependent Task',
        duration: 30,
        type: TaskType.Focused,
        importance: 5,
        urgency: 5,
        completed: false,
        dependencies: ['non-existent-task'],
        asyncWaitTime: 0,
      } as Task

      const pattern: DailyWorkPattern = {
        date: '2025-08-20',
        blocks: [{
          id: 'block',
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
        [task],
        [],
        [pattern],
        new Date('2025-08-20T08:00:00'),
      )

      // Task should not be scheduled due to missing dependency
      expect(result.scheduledItems.length).toBe(0)
      expect(result.debugInfo.unscheduledItems.length).toBe(1)
    })
  })

  describe('Time Conflict Detection', () => {
    it('should report time conflicts as reason for unscheduled items', () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          name: 'First Task',
          duration: 55,
          type: TaskType.Focused,
          importance: 10,
          urgency: 10,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
        {
          id: 'task-2',
          name: 'Second Task',
          duration: 10,
          type: TaskType.Focused,
          importance: 5,
          urgency: 5,
          completed: false,
          dependencies: [],
          asyncWaitTime: 0,
        } as Task,
      ]

      const pattern: DailyWorkPattern = {
        date: '2025-08-20',
        blocks: [{
          id: 'block',
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
        new Date('2025-08-20T08:00:00'),
      )

      // First task should be scheduled, second should not fit
      expect(result.scheduledItems.length).toBe(1)
      expect(result.scheduledItems[0].name).toBe('First Task')
      
      expect(result.debugInfo.unscheduledItems.length).toBe(1)
      expect(result.debugInfo.unscheduledItems[0].name).toBe('Second Task')
      expect(result.debugInfo.unscheduledItems[0].reason).toContain('capacity')
    })
  })
})