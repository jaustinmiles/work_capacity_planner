import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleItemsWithBlocks } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'
import { DailyWorkPattern } from '@shared/scheduling-models'

describe('No Overlap Scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not schedule multiple items at the same time when starting mid-block', () => {
    // Set current time to middle of a work block
    const now = new Date('2025-09-02T09:30:00')
    
    // Create tasks that should be scheduled
    const tasks: Task[] = [
      {
        id: 'task-1',
        name: 'Task 1',
        type: TaskType.Focused,
        duration: 30,
        importance: 5,
        urgency: 5,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'task-2',
        name: 'Task 2',
        type: TaskType.Focused,
        duration: 30,
        importance: 5,
        urgency: 5,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'task-3',
        name: 'Task 3',
        type: TaskType.Focused,
        duration: 30,
        importance: 5,
        urgency: 5,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    // Work patterns for the day - block already started
    const patterns: DailyWorkPattern[] = [
      {
        date: '2025-09-02',
        blocks: [
          {
            id: 'block-1',
            type: TaskType.Focused,
            startTime: '09:00',
            endTime: '12:00',
            capacity: {
              focusMinutes: 180, // 3 hours
            },
            usedCapacity: 0,
          },
        ],
        meetings: [],
      },
    ]

    const scheduledItems = scheduleItemsWithBlocks(
      tasks,
      [],
      patterns,
      now,
      {
        allowTaskSplitting: false,
      },
    )

    // Verify items were scheduled
    expect(scheduledItems).toHaveLength(3)

    // Check that no two items have the same start time
    const startTimes = scheduledItems.map(item => item.startTime.getTime())
    const uniqueStartTimes = new Set(startTimes)
    
    expect(uniqueStartTimes.size).toBe(startTimes.length)
    
    // Verify items are scheduled sequentially, not overlapping
    for (let i = 0; i < scheduledItems.length - 1; i++) {
      const currentItem = scheduledItems[i]
      const nextItem = scheduledItems[i + 1]
      
      // Next item should start when current item ends (or later)
      expect(nextItem.startTime.getTime()).toBeGreaterThanOrEqual(currentItem.endTime.getTime())
    }

    // First item should start at current time (9:30 AM)
    expect(scheduledItems[0].startTime.getTime()).toBe(now.getTime())
    
    // Second item should start when first ends (10:00 AM)
    expect(scheduledItems[1].startTime.getTime()).toBe(
      scheduledItems[0].endTime.getTime()
    )
    
    // Third item should start when second ends (10:30 AM)
    expect(scheduledItems[2].startTime.getTime()).toBe(
      scheduledItems[1].endTime.getTime()
    )
  })

  it('should handle multiple items being scheduled in a block that has already started', () => {
    // Current time is 2:00 PM, block started at 1:30 PM
    const now = new Date('2025-09-02T14:00:00')
    
    const workflows = [
      {
        id: 'workflow-1',
        name: 'Workflow 1',
        type: TaskType.Focused,
        totalDuration: 60,
        steps: [
          {
            id: 'step-1-1',
            name: 'Step 1.1',
            duration: 20,
            type: TaskType.Focused,
            stepIndex: 0,
            dependsOn: [],
          },
          {
            id: 'step-1-2',
            name: 'Step 1.2',
            duration: 20,
            type: TaskType.Focused,
            stepIndex: 1,
            dependsOn: [],
          },
        ],
      },
      {
        id: 'workflow-2',
        name: 'Workflow 2',
        type: TaskType.Focused,
        totalDuration: 30,
        steps: [
          {
            id: 'step-2-1',
            name: 'Step 2.1',
            duration: 15,
            type: TaskType.Focused,
            stepIndex: 0,
            dependsOn: [],
          },
        ],
      },
    ]

    const patterns: DailyWorkPattern[] = [
      {
        date: '2025-09-02',
        blocks: [
          {
            id: 'block-afternoon',
            type: 'flexible',
            startTime: '13:30', // 1:30 PM
            endTime: '17:00', // 5:00 PM
            capacity: {
              focusMinutes: 210, // 3.5 hours - flexible blocks can be used for any type
              adminMinutes: 210,
            },
            usedCapacity: 0,
          },
        ],
        meetings: [],
      },
    ]

    const scheduledItems = scheduleItemsWithBlocks(
      [],
      workflows as any,
      patterns,
      now,
      {
        allowTaskSplitting: false,
      },
    )

    // All 3 workflow steps should be scheduled
    const workflowSteps = scheduledItems.filter(item => 
      item.type === 'workflow-step'
    )
    expect(workflowSteps).toHaveLength(3)

    // Verify no overlapping times
    for (let i = 0; i < workflowSteps.length - 1; i++) {
      const currentStep = workflowSteps[i]
      const nextStep = workflowSteps[i + 1]
      
      // Steps should not overlap
      expect(currentStep.endTime.getTime()).toBeLessThanOrEqual(nextStep.startTime.getTime())
      
      // Steps should not have the same start time
      expect(currentStep.startTime.getTime()).not.toBe(nextStep.startTime.getTime())
    }
  })
})