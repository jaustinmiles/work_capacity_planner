/**
 * Tests for async wait scheduling optimization
 * Verifies that workflows with async waits are kept together in the same day when possible
 */

import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { TaskType } from '@shared/enums'
import { SequencedTask } from '@shared/sequencing-types'

describe('Async Wait Scheduling Optimization', () => {
  describe('Workflow with async waits', () => {
    it('should keep workflow steps together when async wait completes within the same day', () => {
      // Create a workflow like a bedtime routine with async waits
      const bedtimeWorkflow: SequencedTask = {
        id: 'bedtime-workflow',
        name: 'Bedtime Routine',
        duration: 80,
        importance: 7,
        urgency: 5,
        type: TaskType.Deep,
        deadline: null,
        dependencies: [],
        overallStatus: 'not_started',
        hasSteps: true,
        steps: [
          {
            id: 'step-1',
            taskId: 'bedtime-workflow',
            name: 'Brush teeth',
            duration: 5,
            type: TaskType.Admin,
            dependsOn: [],
            asyncWaitTime: 0,
            status: 'not_started',
            stepIndex: 0,
          },
          {
            id: 'step-2',
            taskId: 'bedtime-workflow',
            name: 'Take melatonin',
            duration: 2,
            type: TaskType.Admin,
            dependsOn: ['step-1'],
            asyncWaitTime: 60, // 60 minute wait for melatonin to kick in
            status: 'not_started',
            stepIndex: 1,
          },
          {
            id: 'step-3',
            taskId: 'bedtime-workflow',
            name: 'Read book',
            duration: 30,
            type: TaskType.Deep,
            dependsOn: ['step-2'],
            asyncWaitTime: 0,
            status: 'not_started',
            stepIndex: 2,
          },
          {
            id: 'step-4',
            taskId: 'bedtime-workflow',
            name: 'Sleep meditation',
            duration: 15,
            type: TaskType.Deep,
            dependsOn: ['step-3'],
            asyncWaitTime: 0,
            status: 'not_started',
            stepIndex: 3,
          },
        ],
      }

      // Create work pattern for Friday evening with enough time
      const workPatterns = [
        {
          date: '2025-08-29', // Friday
          blocks: [
            {
              id: 'evening-block',
              startTime: '20:00',
              endTime: '23:30',
              capacity: {
                focusMinutes: 120,
                adminMinutes: 90,
              },
            },
          ],
          accumulated: {
            focusMinutes: 120,
            adminMinutes: 90,
          },
          meetings: [],
        },
        {
          date: '2025-09-01', // Monday (next available day)
          blocks: [
            {
              id: 'morning-block',
              startTime: '09:00',
              endTime: '12:00',
              capacity: {
                focusMinutes: 120,
                adminMinutes: 60,
              },
            },
          ],
          accumulated: {
            focusMinutes: 120,
            adminMinutes: 60,
          },
          meetings: [],
        },
      ]

      // Schedule at 8 PM Friday
      const startDate = new Date('2025-08-29T20:00:00')

      const result = scheduleItemsWithBlocksAndDebug(
        [], // No regular tasks
        [bedtimeWorkflow],
        workPatterns,
        startDate,
      )

      // All 4 steps should be scheduled (excluding async-wait items)
      const bedtimeSteps = result.scheduledItems.filter(item =>
        item.name.includes('Bedtime Routine') && item.type !== 'async-wait',
      )
      expect(bedtimeSteps).toHaveLength(4)

      // All steps should be scheduled on the same day
      if (bedtimeSteps.length > 0) {
        const firstStepDate = bedtimeSteps[0].startTime.toISOString().split('T')[0]
        const allOnSameDay = bedtimeSteps.every(step =>
          step.startTime.toISOString().split('T')[0] === firstStepDate,
        )
        expect(allOnSameDay).toBe(true)
      }

      // Verify the async wait is respected
      const melStep = bedtimeSteps.find(s => s.name.includes('Take melatonin'))
      const readStep = bedtimeSteps.find(s => s.name.includes('Read book'))

      if (melStep && readStep) {
        const melEnd = new Date(melStep.endTime)
        const readStart = new Date(readStep.startTime)
        const waitTime = (readStart.getTime() - melEnd.getTime()) / (1000 * 60)

        // Read should start about 60 minutes after melatonin
        expect(waitTime).toBeGreaterThanOrEqual(55) // Allow some flexibility
        expect(waitTime).toBeLessThanOrEqual(65)
      }
    })

    it('should move to next day only when async wait extends beyond current day blocks', () => {
      // Create a workflow with a very long async wait
      const longWaitWorkflow: SequencedTask = {
        id: 'long-wait-workflow',
        name: 'Long Wait Workflow',
        duration: 45,
        importance: 6,
        urgency: 4,
        type: TaskType.Admin,
        deadline: null,
        dependencies: [],
        overallStatus: 'not_started',
        hasSteps: true,
        steps: [
          {
            id: 'step-1',
            taskId: 'long-wait-workflow',
            name: 'Start process',
            duration: 15,
            type: TaskType.Admin,
            dependsOn: [],
            asyncWaitTime: 240, // 4 hour wait
            status: 'not_started',
            stepIndex: 0,
          },
          {
            id: 'step-2',
            taskId: 'long-wait-workflow',
            name: 'Complete process',
            duration: 30,
            type: TaskType.Admin,
            dependsOn: ['step-1'],
            asyncWaitTime: 0,
            status: 'not_started',
            stepIndex: 1,
          },
        ],
      }

      // Work pattern with limited evening time
      const workPatterns = [
        {
          date: '2025-08-29', // Friday
          blocks: [
            {
              id: 'evening-block',
              startTime: '20:00',
              endTime: '22:00', // Only 2 hours
              capacity: {
                focusMinutes: 60,
                adminMinutes: 60,
              },
            },
          ],
          accumulated: {
            focusMinutes: 60,
            adminMinutes: 60,
          },
          meetings: [],
        },
        {
          date: '2025-08-30', // Saturday
          blocks: [
            {
              id: 'morning-block',
              startTime: '09:00',
              endTime: '12:00',
              capacity: {
                focusMinutes: 120,
                adminMinutes: 60,
              },
            },
          ],
          accumulated: {
            focusMinutes: 120,
            adminMinutes: 60,
          },
          meetings: [],
        },
      ]

      const startDate = new Date('2025-08-29T20:00:00')

      const result = scheduleItemsWithBlocksAndDebug(
        [],
        [longWaitWorkflow],
        workPatterns,
        startDate,
      )

      const workflowSteps = result.scheduledItems.filter(item =>
        item.name.includes('Long Wait Workflow') && item.type !== 'async-wait',
      )

      // Steps should be on different days (async wait extends beyond first day blocks)
      const startStep = workflowSteps.find(s => s.name.includes('Start process'))
      const completeStep = workflowSteps.find(s => s.name.includes('Complete process'))

      expect(startStep).toBeDefined()
      expect(completeStep).toBeDefined()

      if (startStep && completeStep) {
        const startDate = startStep.startTime.toISOString().split('T')[0]
        const completeDate = completeStep.startTime.toISOString().split('T')[0]
        // They should be on different days
        expect(startDate).not.toBe(completeDate)
      }
    })

    it('should handle multiple workflows with async waits independently', () => {
      const workflow1: SequencedTask = {
        id: 'workflow-1',
        name: 'Workflow 1',
        duration: 35,
        importance: 8,
        urgency: 6,
        type: TaskType.Deep,
        deadline: null,
        dependencies: [],
        overallStatus: 'not_started',
        hasSteps: true,
        steps: [
          {
            id: 'w1-step-1',
            taskId: 'workflow-1',
            name: 'W1 Step 1',
            duration: 10,
            type: TaskType.Deep,
            dependsOn: [],
            asyncWaitTime: 30,
            status: 'not_started',
            stepIndex: 0,
          },
          {
            id: 'w1-step-2',
            taskId: 'workflow-1',
            name: 'W1 Step 2',
            duration: 25,
            type: TaskType.Deep,
            dependsOn: ['w1-step-1'],
            asyncWaitTime: 0,
            status: 'not_started',
            stepIndex: 1,
          },
        ],
      }

      const workflow2: SequencedTask = {
        id: 'workflow-2',
        name: 'Workflow 2',
        duration: 20,
        importance: 7,
        urgency: 7,
        type: TaskType.Admin,
        deadline: null,
        dependencies: [],
        overallStatus: 'not_started',
        hasSteps: true,
        steps: [
          {
            id: 'w2-step-1',
            taskId: 'workflow-2',
            name: 'W2 Step 1',
            duration: 5,
            type: TaskType.Admin,
            dependsOn: [],
            asyncWaitTime: 0,
            status: 'not_started',
            stepIndex: 0,
          },
          {
            id: 'w2-step-2',
            taskId: 'workflow-2',
            name: 'W2 Step 2',
            duration: 15,
            type: TaskType.Admin,
            dependsOn: ['w2-step-1'],
            asyncWaitTime: 0,
            status: 'not_started',
            stepIndex: 1,
          },
        ],
      }

      const workPatterns = [
        {
          date: '2025-08-29',
          blocks: [
            {
              id: 'block-1',
              startTime: '09:00',
              endTime: '12:00',
              capacity: {
                focusMinutes: 120,
                adminMinutes: 60,
              },
            },
          ],
          accumulated: {
            focusMinutes: 120,
            adminMinutes: 60,
          },
          meetings: [],
        },
      ]

      const startDate = new Date('2025-08-29T09:00:00')

      const result = scheduleItemsWithBlocksAndDebug(
        [],
        [workflow1, workflow2],
        workPatterns,
        startDate,
      )

      // Both workflows should be scheduled
      const w1Steps = result.scheduledItems.filter(item =>
        item.name.includes('Workflow 1') && item.type !== 'async-wait',
      )
      const w2Steps = result.scheduledItems.filter(item =>
        item.name.includes('Workflow 2') && item.type !== 'async-wait',
      )

      expect(w1Steps).toHaveLength(2)
      expect(w2Steps).toHaveLength(2)

      // Workflow 2 (no async wait) should be scheduled normally
      const w2Step1 = w2Steps.find(s => s.name.includes('W2 Step 1'))
      const w2Step2 = w2Steps.find(s => s.name.includes('W2 Step 2'))

      if (w2Step1 && w2Step2) {
        const step1End = new Date(w2Step1.endTime)
        const step2Start = new Date(w2Step2.startTime)

        // Steps should be consecutive (no significant wait)
        const gap = (step2Start.getTime() - step1End.getTime()) / (1000 * 60)
        expect(gap).toBeLessThanOrEqual(5) // Allow small scheduling gaps
      }

      // Workflow 1 should have async wait respected
      const w1Step1 = w1Steps.find(s => s.name.includes('W1 Step 1'))
      const w1Step2 = w1Steps.find(s => s.name.includes('W1 Step 2'))

      if (w1Step1 && w1Step2) {
        const step1End = new Date(w1Step1.endTime)
        const step2Start = new Date(w1Step2.startTime)

        // Should have ~30 minute async wait
        const gap = (step2Start.getTime() - step1End.getTime()) / (1000 * 60)
        expect(gap).toBeGreaterThanOrEqual(25)
        expect(gap).toBeLessThanOrEqual(35)
      }
    })

    it('should handle edge case of async wait at end of day boundary', () => {
      const boundaryWorkflow: SequencedTask = {
        id: 'boundary-workflow',
        name: 'Boundary Workflow',
        duration: 32,
        importance: 6,
        urgency: 5,
        type: TaskType.Admin,
        deadline: null,
        dependencies: [],
        overallStatus: 'not_started',
        hasSteps: true,
        steps: [
          {
            id: 'step-1',
            taskId: 'boundary-workflow',
            name: 'Step at boundary',
            duration: 15,
            type: TaskType.Admin,
            dependsOn: [],
            asyncWaitTime: 45, // Wait extends slightly past block end
            status: 'not_started',
            stepIndex: 0,
          },
          {
            id: 'step-2',
            taskId: 'boundary-workflow',
            name: 'Step after wait',
            duration: 17,
            type: TaskType.Admin,
            dependsOn: ['step-1'],
            asyncWaitTime: 0,
            status: 'not_started',
            stepIndex: 1,
          },
        ],
      }

      const workPatterns = [
        {
          date: '2025-08-29',
          blocks: [
            {
              id: 'block-1',
              startTime: '21:00',
              endTime: '22:00', // Only 1 hour block
              capacity: {
                focusMinutes: 30,
                adminMinutes: 30,
              },
            },
          ],
          accumulated: {
            focusMinutes: 30,
            adminMinutes: 30,
          },
          meetings: [],
        },
        {
          date: '2025-08-30',
          blocks: [
            {
              id: 'block-2',
              startTime: '09:00',
              endTime: '11:00',
              capacity: {
                focusMinutes: 60,
                adminMinutes: 60,
              },
            },
          ],
          accumulated: {
            focusMinutes: 60,
            adminMinutes: 60,
          },
          meetings: [],
        },
      ]

      const startDate = new Date('2025-08-29T21:00:00')

      const result = scheduleItemsWithBlocksAndDebug(
        [],
        [boundaryWorkflow],
        workPatterns,
        startDate,
      )

      const steps = result.scheduledItems.filter(item =>
        item.name.includes('Boundary Workflow') && item.type !== 'async-wait',
      )

      // Steps should be on different days (async wait extends past first block)
      const step1 = steps.find(s => s.name.includes('Step at boundary'))
      const step2 = steps.find(s => s.name.includes('Step after wait'))

      expect(step1).toBeDefined()
      expect(step2).toBeDefined()

      if (step1 && step2) {
        const date1 = step1.startTime.toISOString().split('T')[0]
        const date2 = step2.startTime.toISOString().split('T')[0]
        // They should be on different days
        expect(date1).not.toBe(date2)
      }
    })
  })
})
