import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug as scheduleFlexibly } from './flexible-scheduler'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Flexible Scheduler - Async Wait Time Handling', () => {
  const createWorkPattern = (date: string): DailyWorkPattern => ({
    date,
    blocks: [
      {
        id: 'morning-block',
        startTime: '09:00',
        endTime: '17:00',
        type: 'mixed',
        sessionId: 'test-session',        capacity: { focused: 240, admin: 240 },
      },
    ],
    meetings: [],
  })

  describe('Critical: Async wait time must block dependent steps', () => {
    it('should NOT schedule dependent step during async wait period', () => {
      const workflow: SequencedTask = {
        id: 'workflow-1',
        name: 'Test Workflow',
        importance: 5,
        urgency: 5,
        type: 'focused',
        sessionId: 'test-session',        duration: 120,
        duration: 120,
        criticalPathDuration: 1560, // 60 + 1440 wait + 60
        worstCaseDuration: 1560,
        overallStatus: 'not_started',
        dependencies: [],
        steps: [
          {
            id: 'step-1',
            sequencedTaskId: 'workflow-1',
            taskId: 'workflow-1',
            name: 'Step 1 - Submit for review',
            stepIndex: 0,
            type: 'focused',
        sessionId: 'test-session',            duration: 60,
            asyncWaitTime: 1440, // 24 hours wait
            status: 'pending',
            dependsOn: [],
          },
          {
            id: 'step-2',
            sequencedTaskId: 'workflow-1',
            taskId: 'workflow-1',
            name: 'Step 2 - Process review feedback',
            stepIndex: 1,
            type: 'focused',
        sessionId: 'test-session',            duration: 60,
            asyncWaitTime: 0,
            status: 'pending',
            dependsOn: ['step-1'], // Depends on step-1
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const startDate = new Date('2025-01-13T09:00:00')
      const patterns = [
        createWorkPattern('2025-01-13'),
        createWorkPattern('2025-01-14'),
        createWorkPattern('2025-01-15'),
      ]

      const { scheduledItems, debugInfo } = scheduleFlexibly(
        [],
        [workflow],
        patterns,
        startDate,
      )

      // Find the scheduled items
      const step1 = scheduledItems.find(item => item.id === 'step-1')
      const step1Wait = scheduledItems.find(item => item.id === 'step-1-wait')
      const step2 = scheduledItems.find(item => item.id === 'step-2')

      // Verify step 1 is scheduled
      expect(step1).toBeDefined()
      expect(step1!.startTime).toEqual(new Date('2025-01-13T09:00:00'))
      expect(step1!.endTime).toEqual(new Date('2025-01-13T10:00:00'))

      // Verify async wait is scheduled
      expect(step1Wait).toBeDefined()
      expect(step1Wait!.type).toBe('async-wait')
      expect(step1Wait!.startTime).toEqual(new Date('2025-01-13T10:00:00'))
      expect(step1Wait!.endTime).toEqual(new Date('2025-01-14T10:00:00')) // 24 hours later
      expect(step1Wait!.duration).toBe(1440)

      // CRITICAL: Step 2 should NOT be scheduled until AFTER the async wait
      expect(step2).toBeDefined()
      expect(step2!.startTime.getTime()).toBeGreaterThanOrEqual(
        step1Wait!.endTime.getTime(),
      )

      // Step 2 should be on the next day after the wait completes
      expect(step2!.startTime).toEqual(new Date('2025-01-14T10:00:00'))

      // Check for any warnings in debug info
      const warningsAboutStep2 = debugInfo.warnings.filter(w =>
        w.includes('Step 2') || w.includes('step-2'),
      )
      console.log('Scheduling warnings:', warningsAboutStep2)
    })

    it('should allow other tasks to be scheduled during async wait', () => {
      const workflow: SequencedTask = {
        id: 'workflow-1',
        name: 'Workflow with Wait',
        importance: 5,
        urgency: 5,
        type: 'focused',
        sessionId: 'test-session',        duration: 90,
        duration: 90,
        criticalPathDuration: 1530,
        worstCaseDuration: 1530,
        overallStatus: 'not_started',
        dependencies: [],
        steps: [
          {
            id: 'step-1',
            sequencedTaskId: 'workflow-1',
            taskId: 'workflow-1',
            name: 'Submit',
            stepIndex: 0,
            type: 'focused',
        sessionId: 'test-session',            duration: 30,
            asyncWaitTime: 1440, // 24 hour wait
            status: 'pending',
            dependsOn: [],
          },
          {
            id: 'step-2',
            sequencedTaskId: 'workflow-1',
            taskId: 'workflow-1',
            name: 'Review',
            stepIndex: 1,
            type: 'focused',
        sessionId: 'test-session',            duration: 60,
            asyncWaitTime: 0,
            status: 'pending',
            dependsOn: ['step-1'],
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const independentTask: Task = {
        id: 'task-1',
        name: 'Independent Task',
        duration: 120,
        importance: 4,
        urgency: 4,
        type: 'focused',
        sessionId: 'test-session',        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        hasSteps: false,
        overallStatus: 'not_started',
        criticalPathDuration: 120,
        worstCaseDuration: 120,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const startDate = new Date('2025-01-13T09:00:00')
      const patterns = [
        createWorkPattern('2025-01-13'),
        createWorkPattern('2025-01-14'),
      ]

      const { scheduledItems } = scheduleFlexibly(
        [independentTask],
        [workflow],
        patterns,
        startDate,
      )

      const step1 = scheduledItems.find(item => item.id === 'step-1')
      const independentScheduled = scheduledItems.find(item => item.id === 'task-1')
      const step2 = scheduledItems.find(item => item.id === 'step-2')

      // Step 1 should be scheduled first (higher priority)
      expect(step1!.startTime).toEqual(new Date('2025-01-13T09:00:00'))

      // Independent task should be scheduled during the async wait period
      expect(independentScheduled).toBeDefined()
      expect(independentScheduled!.startTime.getTime()).toBeGreaterThanOrEqual(
        step1!.endTime.getTime(),
      )
      expect(independentScheduled!.startTime.getTime()).toBeLessThan(
        new Date('2025-01-14T10:00:00').getTime(), // Before step 2
      )

      // Step 2 should be after the async wait
      expect(step2!.startTime.getTime()).toBeGreaterThanOrEqual(
        new Date('2025-01-14T10:00:00').getTime(),
      )
    })

    it('should handle multiple dependencies with different async wait times', () => {
      const workflow: SequencedTask = {
        id: 'workflow-1',
        name: 'Complex Workflow',
        importance: 5,
        urgency: 5,
        type: 'focused',
        sessionId: 'test-session',        duration: 150,
        duration: 150,
        criticalPathDuration: 270,
        worstCaseDuration: 270,
        overallStatus: 'not_started',
        dependencies: [],
        steps: [
          {
            id: 'step-1',
            sequencedTaskId: 'workflow-1',
            taskId: 'workflow-1',
            name: 'Quick check',
            stepIndex: 0,
            type: 'focused',
        sessionId: 'test-session',            duration: 30,
            asyncWaitTime: 60, // 1 hour wait
            status: 'pending',
            dependsOn: [],
          },
          {
            id: 'step-2',
            sequencedTaskId: 'workflow-1',
            taskId: 'workflow-1',
            name: 'Long review',
            stepIndex: 1,
            type: 'focused',
        sessionId: 'test-session',            duration: 30,
            asyncWaitTime: 120, // 2 hour wait
            status: 'pending',
            dependsOn: [],
          },
          {
            id: 'step-3',
            sequencedTaskId: 'workflow-1',
            taskId: 'workflow-1',
            name: 'Final step',
            stepIndex: 2,
            type: 'focused',
        sessionId: 'test-session',            duration: 90,
            asyncWaitTime: 0,
            status: 'pending',
            dependsOn: ['step-1', 'step-2'], // Depends on both
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const startDate = new Date('2025-01-13T09:00:00')
      const patterns = [createWorkPattern('2025-01-13')]

      const { scheduledItems } = scheduleFlexibly(
        [],
        [workflow],
        patterns,
        startDate,
      )

      const step1 = scheduledItems.find(item => item.id === 'step-1')
      const step2 = scheduledItems.find(item => item.id === 'step-2')
      const step3 = scheduledItems.find(item => item.id === 'step-3')
      const step2Wait = scheduledItems.find(item => item.id === 'step-2-wait')

      // Step 3 should wait for the longest dependency (step-2 with 2 hour wait)
      expect(step3).toBeDefined()
      expect(step3!.startTime.getTime()).toBeGreaterThanOrEqual(
        step2Wait!.endTime.getTime(),
      )
    })
  })

  describe('Data validation', () => {
    it('should handle corrupted dependency IDs gracefully', () => {
      const workflow: SequencedTask = {
        id: 'workflow-1',
        name: 'Workflow with Bad Deps',
        importance: 5,
        urgency: 5,
        type: 'focused',
        sessionId: 'test-session',        duration: 60,
        duration: 60,
        criticalPathDuration: 60,
        worstCaseDuration: 60,
        overallStatus: 'not_started',
        dependencies: [],
        steps: [
          {
            id: 'step-1',
            sequencedTaskId: 'workflow-1',
            taskId: 'workflow-1',
            name: 'Step 1',
            stepIndex: 0,
            type: 'focused',
        sessionId: 'test-session',            duration: 30,
            asyncWaitTime: 0,
            status: 'pending',
            dependsOn: [],
          },
          {
            id: 'step-2',
            sequencedTaskId: 'workflow-1',
            taskId: 'workflow-1',
            name: 'Step 2',
            stepIndex: 1,
            type: 'focused',
        sessionId: 'test-session',            duration: 30,
            asyncWaitTime: 0,
            status: 'pending',
            dependsOn: ['non-existent-step-id'], // Bad dependency
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const startDate = new Date('2025-01-13T09:00:00')
      const patterns = [createWorkPattern('2025-01-13')]

      const { scheduledItems, debugInfo } = scheduleFlexibly(
        [],
        [workflow],
        patterns,
        startDate,
      )

      // Should still schedule step 1
      const step1 = scheduledItems.find(item => item.id === 'step-1')
      expect(step1).toBeDefined()

      // Should have a warning about the bad dependency
      const depWarnings = debugInfo.warnings.filter(w =>
        w.includes('non-existent-step-id'),
      )
      expect(depWarnings?.length).toBeGreaterThan(0)
    })
  })
})
