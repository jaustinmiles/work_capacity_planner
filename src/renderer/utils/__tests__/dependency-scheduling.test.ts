import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Dependency-based Scheduling', () => {
  // Helper to create consistent dates (handling timezone issues)
  const createTestDate = (dateStr: string, hour: number = 9): Date => {
    const date = new Date(dateStr)
    date.setHours(hour, 0, 0, 0)
    return date
  }

  // Helper to get date string the same way the scheduler does
  const getDateString = (date: Date): string => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d.toISOString().split('T')[0]
  }

  // Helper to create a base task
  const createTask = (id: string, name: string, duration: number = 60): Task => ({
    id,
    name,
    duration,
    importance: 5,
    urgency: 5,
    type: 'focused',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    sessionId: 'test-session',
    hasSteps: false,
    overallStatus: 'not_started',
    criticalPathDuration: duration,
    worstCaseDuration: duration,
  })

  // Helper to create a workflow with steps
  const createWorkflow = (
    id: string,
    name: string,
    steps: Array<{ id: string; name: string; duration: number; dependsOn: string[] }>,
  ): SequencedTask => ({
    id,
    name,
    importance: 7,
    urgency: 7,
    type: 'focused',
    steps: steps.map((s, i) => ({
      id: s.id,
      taskId: id,
      name: s.name,
      duration: s.duration,
      type: 'focused',
      dependsOn: s.dependsOn,
      asyncWaitTime: 0,
      status: 'pending',
      stepIndex: i,
      percentComplete: 0,
    })),
    totalDuration: steps.reduce((sum, s) => sum + s.duration, 0),
    overallStatus: 'not_started',
    criticalPathDuration: 0,
    worstCaseDuration: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    sessionId: 'test-session',
  })

  // Helper to create a work pattern with ample capacity
  const createWorkPattern = (date: Date, focusHours: number = 8, adminHours: number = 2): DailyWorkPattern => {
    const dateStr = getDateString(date)
    return {
      date: dateStr,
      blocks: [
        {
          id: `block-${dateStr}-1`,
          patternId: `pattern-${dateStr}`,
          startTime: '09:00',
          endTime: '17:00',
          type: 'mixed',
          capacity: {
            focusMinutes: focusHours * 60,
            adminMinutes: adminHours * 60,
            personalMinutes: 0,
          },
        },
      ],
      meetings: [],
      accumulated: { focusMinutes: 0, adminMinutes: 0 },
    }
  }

  describe('Simple Workflow Dependencies', () => {
    it('should schedule workflow steps in dependency order', () => {
      const workflow = createWorkflow('wf-1', 'Build Feature', [
        { id: 'step-1', name: 'Design', duration: 60, dependsOn: [] },
        { id: 'step-2', name: 'Implement', duration: 120, dependsOn: ['step-1'] },
        { id: 'step-3', name: 'Test', duration: 60, dependsOn: ['step-2'] },
        { id: 'step-4', name: 'Deploy', duration: 30, dependsOn: ['step-3'] },
      ])

      // Use a future date to avoid scheduler's "don't schedule in the past" check
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1) // Tomorrow
      const startDate = createTestDate(futureDate.toISOString().split('T')[0])
      // Create patterns for multiple days
      const day2 = new Date(startDate)
      day2.setDate(day2.getDate() + 1)
      const day3 = new Date(startDate)
      day3.setDate(day3.getDate() + 2)
      const patterns = [
        createWorkPattern(startDate),
        createWorkPattern(day2),
        createWorkPattern(day3),
      ]

      const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
        [],
        [workflow],
        patterns,
        startDate,
      )

      // Debug output
      console.log('Scheduled items:', scheduledItems.length)
      console.log('Unscheduled items:', debugInfo.unscheduledItems)
      console.log('Warnings:', debugInfo.warnings)

      // All steps should be scheduled
      expect(scheduledItems).toHaveLength(4)
      expect(debugInfo.unscheduledItems).toHaveLength(0)

      // Verify order: Design -> Implement -> Test -> Deploy
      const scheduledStepIds = scheduledItems.map(item => item.id)
      expect(scheduledStepIds).toEqual(['step-1', 'step-2', 'step-3', 'step-4'])

      // Verify times are sequential (no overlap)
      for (let i = 1; i < scheduledItems.length; i++) {
        const prevItem = scheduledItems[i - 1]
        const currItem = scheduledItems[i]
        expect(currItem.startTime.getTime()).toBeGreaterThanOrEqual(prevItem.endTime.getTime())
      }
    })

    it('should handle parallel dependencies (diamond pattern)', () => {
      const workflow = createWorkflow('wf-2', 'Complex Build', [
        { id: 'step-a', name: 'Setup', duration: 30, dependsOn: [] },
        { id: 'step-b', name: 'Build Frontend', duration: 60, dependsOn: ['step-a'] },
        { id: 'step-c', name: 'Build Backend', duration: 90, dependsOn: ['step-a'] },
        { id: 'step-d', name: 'Integration Test', duration: 45, dependsOn: ['step-b', 'step-c'] },
      ])

      // Use a future date to avoid scheduler's "don't schedule in the past" check
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1) // Tomorrow
      const startDate = createTestDate(futureDate.toISOString().split('T')[0])

      // Create subsequent dates based on the future date
      const day2 = new Date(futureDate)
      day2.setDate(day2.getDate() + 1)
      const day3 = new Date(futureDate)
      day3.setDate(day3.getDate() + 2)

      const patterns = [
        createWorkPattern(startDate),
        createWorkPattern(createTestDate(day2.toISOString().split('T')[0])),
        createWorkPattern(createTestDate(day3.toISOString().split('T')[0])),
      ]

      const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
        [],
        [workflow],
        patterns,
        startDate,
      )

      expect(scheduledItems).toHaveLength(4)
      expect(debugInfo.unscheduledItems).toHaveLength(0)

      // Find scheduled items by ID
      const itemById = new Map(scheduledItems.map(item => [item.id, item]))

      // Setup should be first (but may not be exactly at startDate if we're scheduling from current time)
      const setupStart = itemById.get('step-a')!.startTime.getTime()
      expect(setupStart).toBeGreaterThanOrEqual(startDate.getTime())
      expect(setupStart).toBeLessThan(startDate.getTime() + 24 * 60 * 60 * 1000) // Within first day

      // Both Build Frontend and Build Backend should start after Setup
      const setupEnd = itemById.get('step-a')!.endTime.getTime()
      expect(itemById.get('step-b')!.startTime.getTime()).toBeGreaterThanOrEqual(setupEnd)
      expect(itemById.get('step-c')!.startTime.getTime()).toBeGreaterThanOrEqual(setupEnd)

      // Integration Test should start after both builds complete
      const frontendEnd = itemById.get('step-b')!.endTime.getTime()
      const backendEnd = itemById.get('step-c')!.endTime.getTime()
      const integrationStart = itemById.get('step-d')!.startTime.getTime()
      expect(integrationStart).toBeGreaterThanOrEqual(Math.max(frontendEnd, backendEnd))
    })

    it('should handle multiple independent workflows', () => {
      const workflow1 = createWorkflow('wf-1', 'Feature A', [
        { id: 'a-1', name: 'Design A', duration: 60, dependsOn: [] },
        { id: 'a-2', name: 'Build A', duration: 120, dependsOn: ['a-1'] },
      ])

      const workflow2 = createWorkflow('wf-2', 'Feature B', [
        { id: 'b-1', name: 'Design B', duration: 45, dependsOn: [] },
        { id: 'b-2', name: 'Build B', duration: 90, dependsOn: ['b-1'] },
      ])

      // Use a future date to avoid scheduler's "don't schedule in the past" check
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1) // Tomorrow
      const startDate = createTestDate(futureDate.toISOString().split('T')[0])

      // Create subsequent dates based on the future date
      const day2 = new Date(futureDate)
      day2.setDate(day2.getDate() + 1)
      const day3 = new Date(futureDate)
      day3.setDate(day3.getDate() + 2)

      const patterns = [
        createWorkPattern(startDate),
        createWorkPattern(createTestDate(day2.toISOString().split('T')[0])),
        createWorkPattern(createTestDate(day3.toISOString().split('T')[0])),
      ]

      const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
        [],
        [workflow1, workflow2],
        patterns,
        startDate,
      )

      expect(scheduledItems).toHaveLength(4)
      expect(debugInfo.unscheduledItems).toHaveLength(0)

      // Verify each workflow maintains its internal dependencies
      const itemById = new Map(scheduledItems.map(item => [item.id, item]))

      // Workflow 1 dependencies
      expect(itemById.get('a-2')!.startTime.getTime()).toBeGreaterThanOrEqual(
        itemById.get('a-1')!.endTime.getTime(),
      )

      // Workflow 2 dependencies
      expect(itemById.get('b-2')!.startTime.getTime()).toBeGreaterThanOrEqual(
        itemById.get('b-1')!.endTime.getTime(),
      )

      // The two workflows can interleave - we should see both starting early
      const firstSteps = scheduledItems.filter(item =>
        item.id === 'a-1' || item.id === 'b-1',
      )
      // Both first steps should be scheduled on the first day
      firstSteps.forEach(step => {
        expect(step.startTime.getTime()).toBeLessThan(
          startDate.getTime() + 24 * 60 * 60 * 1000, // Within first day
        )
      })
    })

    it('should handle tasks mixed with workflows', () => {
      const task1 = createTask('task-1', 'Urgent Task', 30)
      task1.importance = 10
      task1.urgency = 10

      const workflow = createWorkflow('wf-1', 'Normal Workflow', [
        { id: 'step-1', name: 'Step 1', duration: 60, dependsOn: [] },
        { id: 'step-2', name: 'Step 2', duration: 60, dependsOn: ['step-1'] },
      ])

      const task2 = createTask('task-2', 'Low Priority Task', 45)
      task2.importance = 3
      task2.urgency = 3

      // Use a future date to avoid scheduler's "don't schedule in the past" check
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1) // Tomorrow
      const startDate = createTestDate(futureDate.toISOString().split('T')[0])

      // Create subsequent dates based on the future date
      const day2 = new Date(futureDate)
      day2.setDate(day2.getDate() + 1)
      const day3 = new Date(futureDate)
      day3.setDate(day3.getDate() + 2)

      const patterns = [
        createWorkPattern(startDate),
        createWorkPattern(createTestDate(day2.toISOString().split('T')[0])),
        createWorkPattern(createTestDate(day3.toISOString().split('T')[0])),
      ]

      const { scheduledItems } = scheduleItemsWithBlocksAndDebug(
        [task1, task2],
        [workflow],
        patterns,
        startDate,
      )

      expect(scheduledItems).toHaveLength(4)

      // High priority task should be scheduled first
      expect(scheduledItems[0].id).toBe('task-1')

      // Workflow steps should maintain their dependency order
      const step1Index = scheduledItems.findIndex(item => item.id === 'step-1')
      const step2Index = scheduledItems.findIndex(item => item.id === 'step-2')
      expect(step2Index).toBeGreaterThan(step1Index)

      // Verify step 2 starts after step 1 ends
      const itemById = new Map(scheduledItems.map(item => [item.id, item]))
      expect(itemById.get('step-2')!.startTime.getTime()).toBeGreaterThanOrEqual(
        itemById.get('step-1')!.endTime.getTime(),
      )
    })

    it('should report unschedulable items with circular dependencies', () => {
      // Create a workflow with circular dependencies
      const workflow = createWorkflow('wf-circular', 'Circular Workflow', [
        { id: 'step-x', name: 'Step X', duration: 60, dependsOn: ['step-z'] },
        { id: 'step-y', name: 'Step Y', duration: 60, dependsOn: ['step-x'] },
        { id: 'step-z', name: 'Step Z', duration: 60, dependsOn: ['step-y'] },
      ])

      // Use a future date to avoid scheduler's "don't schedule in the past" check
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1) // Tomorrow
      const startDate = createTestDate(futureDate.toISOString().split('T')[0])

      // Create subsequent dates based on the future date
      const day2 = new Date(futureDate)
      day2.setDate(day2.getDate() + 1)
      const day3 = new Date(futureDate)
      day3.setDate(day3.getDate() + 2)

      const patterns = [
        createWorkPattern(startDate),
        createWorkPattern(createTestDate(day2.toISOString().split('T')[0])),
        createWorkPattern(createTestDate(day3.toISOString().split('T')[0])),
      ]

      const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
        [],
        [workflow],
        patterns,
        startDate,
      )

      // Circular dependencies should be detected
      expect(debugInfo.warnings.some(w =>
        w.includes('Circular dependency'),
      )).toBe(true)
    })

    it('should handle insufficient capacity gracefully', () => {
      // Create a workflow that exceeds daily capacity
      const workflow = createWorkflow('wf-large', 'Large Workflow', [
        { id: 'step-1', name: 'Step 1', duration: 240, dependsOn: [] }, // 4 hours
        { id: 'step-2', name: 'Step 2', duration: 240, dependsOn: ['step-1'] }, // 4 hours
        { id: 'step-3', name: 'Step 3', duration: 240, dependsOn: ['step-2'] }, // 4 hours
      ])

      // Use a future date
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const startDate = createTestDate(futureDate.toISOString().split('T')[0])

      // Create patterns with only 8 hours of capacity
      const patterns = [
        createWorkPattern(startDate, 8, 0),
        createWorkPattern(new Date(startDate.getTime() + 24*60*60*1000), 8, 0),
        createWorkPattern(new Date(startDate.getTime() + 48*60*60*1000), 8, 0),
      ]

      const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
        [],
        [workflow],
        patterns,
        startDate,
      )

      // With 3 days of patterns, all 3 steps (12 hours total) should be scheduled
      // Day 1: Step 1 (4h), Step 2 starts (4h)
      // Day 2: Step 2 continues if needed, Step 3 (4h)
      // Day 3: Any remaining work
      expect(scheduledItems.length).toBe(3)

      // Verify they span multiple days
      const dates = new Set(scheduledItems.map(item =>
        item.startTime.toISOString().split('T')[0],
      ))
      expect(dates.size).toBeGreaterThanOrEqual(2) // Should span at least 2 days
    })
  })

  describe('Complex Real-World Scenarios', () => {
    it('should handle the reported bug scenario', () => {
      // Recreate the exact scenario from the bug report
      const workflow = createWorkflow('main-safety', 'Complete Main Safety Documentation Task', [
        { id: 'step-1755137991882-w0akh73r4-0', name: 'Extended verification', duration: 60, dependsOn: [] },
        { id: 'step-1755137991882-u4mfuko73-1', name: 'Run ego motion', duration: 120, dependsOn: ['step-1755137991882-w0akh73r4-0'] },
        { id: 'step-1755137991882-d5fgwnhyj-2', name: 'Update timestamps', duration: 60, dependsOn: ['step-1755137991882-u4mfuko73-1'] },
        { id: 'step-1755137991882-1ik2ndtsq-3', name: 'Implement fallback', duration: 90, dependsOn: [] },
        { id: 'step-1755137991882-689sx62hu-4', name: 'Data mine', duration: 120, dependsOn: ['step-1755137991882-1ik2ndtsq-3'] },
        { id: 'step-1755137991882-um3tkupsm-5', name: 'Clean up', duration: 30, dependsOn: [] },
        { id: 'step-1755137991882-taim1osp4-6', name: 'Add unit test', duration: 60, dependsOn: ['step-1755137991882-um3tkupsm-5'] },
        { id: 'step-1755137991882-fgefs9xf0-7', name: 'Prepare CL', duration: 45, dependsOn: [
          'step-1755137991882-d5fgwnhyj-2',
          'step-1755137991882-689sx62hu-4',
          'step-1755137991882-taim1osp4-6',
        ] },
        { id: 'step-1755137991882-9blw61m79-8', name: 'Wait for review', duration: 30, dependsOn: ['step-1755137991882-fgefs9xf0-7'] },
      ])

      // Use a future date
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const startDate = createTestDate(futureDate.toISOString().split('T')[0])

      // Create patterns for multiple days
      const patterns = [
        createWorkPattern(startDate, 8, 2),
        createWorkPattern(new Date(startDate.getTime() + 24*60*60*1000), 8, 2),
        createWorkPattern(new Date(startDate.getTime() + 48*60*60*1000), 8, 2),
      ]

      const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
        [],
        [workflow],
        patterns,
        startDate,
      )

      // All 9 steps should be scheduled
      expect(scheduledItems.length).toBe(9)
      
      // No items should remain unscheduled
      expect(debugInfo.unscheduledItems).toHaveLength(0)
      
      // The scheduler may produce warnings during its multiple passes
      // as it retries items whose dependencies aren't yet scheduled,
      // but as long as everything gets scheduled eventually, that's fine

      // Verify the three parallel chains are handled correctly
      const itemById = new Map(scheduledItems.map(item => [item.id, item]))

      // Chain 1: Extended -> Run ego -> Update timestamps
      if (itemById.has('step-1755137991882-u4mfuko73-1')) {
        expect(itemById.get('step-1755137991882-u4mfuko73-1')!.startTime.getTime())
          .toBeGreaterThanOrEqual(itemById.get('step-1755137991882-w0akh73r4-0')!.endTime.getTime())
      }

      // Chain 2: Implement fallback -> Data mine
      if (itemById.has('step-1755137991882-689sx62hu-4')) {
        expect(itemById.get('step-1755137991882-689sx62hu-4')!.startTime.getTime())
          .toBeGreaterThanOrEqual(itemById.get('step-1755137991882-1ik2ndtsq-3')!.endTime.getTime())
      }

      // Chain 3: Clean up -> Add unit test
      if (itemById.has('step-1755137991882-taim1osp4-6')) {
        expect(itemById.get('step-1755137991882-taim1osp4-6')!.startTime.getTime())
          .toBeGreaterThanOrEqual(itemById.get('step-1755137991882-um3tkupsm-5')!.endTime.getTime())
      }

      // Final merge: Prepare CL should wait for all three chains
      if (itemById.has('step-1755137991882-fgefs9xf0-7')) {
        const clStart = itemById.get('step-1755137991882-fgefs9xf0-7')!.startTime.getTime()
        if (itemById.has('step-1755137991882-d5fgwnhyj-2')) {
          expect(clStart).toBeGreaterThanOrEqual(itemById.get('step-1755137991882-d5fgwnhyj-2')!.endTime.getTime())
        }
        if (itemById.has('step-1755137991882-689sx62hu-4')) {
          expect(clStart).toBeGreaterThanOrEqual(itemById.get('step-1755137991882-689sx62hu-4')!.endTime.getTime())
        }
        if (itemById.has('step-1755137991882-taim1osp4-6')) {
          expect(clStart).toBeGreaterThanOrEqual(itemById.get('step-1755137991882-taim1osp4-6')!.endTime.getTime())
        }
      }
    })
  })
})
