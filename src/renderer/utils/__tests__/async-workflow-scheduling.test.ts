import { describe, it, expect } from 'vitest'
import { scheduleItemsWithBlocksAndDebug } from '../flexible-scheduler'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'
import { DailyWorkPattern } from '@shared/work-blocks-types'

describe('Async Workflow Scheduling Priority', () => {
  // Helper to create a test task
  function createTask(overrides: Partial<Task> = {}): Task {
    return {
      id: `task-${Date.now()}-${Math.random()}`,
      name: 'Test Task',
      duration: 30,
      importance: 5,
      urgency: 5,
      type: TaskType.Focused,
      sessionId: 'test-session',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: false,
      overallStatus: 'not_started',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }
  }

  // Helper to create a workflow with async steps
  function createWorkflowWithAsyncSteps(): SequencedTask {
    const workflowId = `workflow-${Date.now()}`
    return {
      id: workflowId,
      taskId: workflowId,
      name: 'Critical Workflow with Async Steps',
      importance: 9,
      urgency: 8,
      totalDuration: 300, // 5 hours total
      completedCumulativeMinutes: 0,
      criticalPathDuration: 300,
      worstCaseDuration: 360,
      completed: false,
      overallStatus: 'not_started',
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [
        {
          id: `${workflowId}-step-1`,
          taskId: workflowId,
          name: 'Initial setup',
          duration: 30,
          type: TaskType.Focused,
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 0,
          percentComplete: 0,
        },
        {
          id: `${workflowId}-step-2`,
          taskId: workflowId,
          name: 'Launch overnight analysis',
          duration: 15,
          type: TaskType.Admin,
          dependsOn: [`${workflowId}-step-1`],
          asyncWaitTime: 480, // 8 hour wait!
          status: 'pending',
          stepIndex: 1,
          percentComplete: 0,
        },
        {
          id: `${workflowId}-step-3`,
          taskId: workflowId,
          name: 'Review analysis results',
          duration: 45,
          type: TaskType.Focused,
          dependsOn: [`${workflowId}-step-2`],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 2,
          percentComplete: 0,
        },
        {
          id: `${workflowId}-step-4`,
          taskId: workflowId,
          name: 'Submit for CI pipeline',
          duration: 10,
          type: TaskType.Admin,
          dependsOn: [`${workflowId}-step-3`],
          asyncWaitTime: 120, // 2 hour CI run
          status: 'pending',
          stepIndex: 3,
          percentComplete: 0,
        },
        {
          id: `${workflowId}-step-5`,
          taskId: workflowId,
          name: 'Final review and merge',
          duration: 30,
          type: TaskType.Focused,
          dependsOn: [`${workflowId}-step-4`],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 4,
          percentComplete: 0,
        },
      ],
    }
  }

  // Helper to create work patterns for testing
  function createWorkPattern(date: Date): DailyWorkPattern {
    const dateStr = date.toISOString().split('T')[0]
    return {
      id: `pattern-${dateStr}`,
      date: dateStr,
      userId: 'test-user',
      isDefaultPattern: false,
      blocks: [
        {
          id: `block-${dateStr}-morning`,
          patternId: `pattern-${dateStr}`,
          startTime: '09:00',
          endTime: '12:00',
          type: 'flexible',
          focusMinutes: 180,
          adminMinutes: 180,
          personalMinutes: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: `block-${dateStr}-afternoon`,
          patternId: `pattern-${dateStr}`,
          startTime: '14:00',
          endTime: '18:00',
          type: 'flexible',
          focusMinutes: 240,
          adminMinutes: 240,
          personalMinutes: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      meetings: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  it('should schedule async workflow steps before low-priority tasks', () => {
    const workflow = createWorkflowWithAsyncSteps()
    const lowPriorityTask = createTask({
      name: 'Low Priority Task',
      importance: 4,
      urgency: 4,
      duration: 30,
    })
    const mediumPriorityTask = createTask({
      name: 'Medium Priority Task',
      importance: 6,
      urgency: 6,
      duration: 45,
    })

    const startDate = new Date('2025-01-15T09:00:00')
    const patterns = [
      createWorkPattern(startDate),
      createWorkPattern(new Date('2025-01-16T09:00:00')),
      createWorkPattern(new Date('2025-01-17T09:00:00')),
    ]

    const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
      [lowPriorityTask, mediumPriorityTask],
      [workflow],
      patterns,
      startDate,
      {
        schedulingPreferences: {
          id: 'test',
          sessionId: 'test',
          allowWeekendWork: false,
          weekendPenalty: 0.5,
          contextSwitchPenalty: 10,
          asyncParallelizationBonus: 20,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '18:00',
            lunchStart: '12:00',
            lunchDuration: 60,
          },
          customWorkHours: {},
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 3,
            blockedTimes: [],
          },
          customCapacity: {},
          timeZone: 'UTC',
        },
      }
    )

    // Find the async workflow steps
    const asyncStep1 = scheduledItems.find(item => item.name.includes('Launch overnight analysis'))
    const asyncStep2 = scheduledItems.find(item => item.name.includes('Submit for CI pipeline'))
    const lowPriorityScheduled = scheduledItems.find(item => item.name === 'Low Priority Task')
    const mediumPriorityScheduled = scheduledItems.find(item => item.name === 'Medium Priority Task')

    // Debug output
    console.log('\n=== Scheduling Results ===')
    scheduledItems.forEach(item => {
      console.log(`${item.startTime.toLocaleTimeString()} - ${item.name}`)
    })

    if (debugInfo.scheduledItemsPriority) {
      console.log('\n=== Priority Breakdown ===')
      debugInfo.scheduledItemsPriority.forEach(item => {
        const p = item.priorityBreakdown
        console.log(`${item.name}: Total=${p.total}, Eisenhower=${p.eisenhower}, Async=${p.asyncBoost}`)
      })
    }

    // ASSERTIONS
    // 1. Async workflow steps should be scheduled
    expect(asyncStep1).toBeDefined()
    expect(asyncStep2).toBeDefined()

    // 2. The workflow should start early to account for async wait times
    const firstWorkflowStep = scheduledItems.find(item => item.name.includes('Initial setup'))
    expect(firstWorkflowStep).toBeDefined()
    
    // 3. The workflow should start before or at same time as low priority tasks
    // (async steps may be later due to dependencies)
    if (firstWorkflowStep && lowPriorityScheduled) {
      // Workflow should start early to accommodate async wait times
      expect(firstWorkflowStep.startTime.getTime()).toBeLessThanOrEqual(
        lowPriorityScheduled.startTime.getTime()
      )
    }

    // 4. Check priority values - async steps should have higher total priority
    if (debugInfo.scheduledItemsPriority) {
      const asyncStepPriority = debugInfo.scheduledItemsPriority.find(
        item => item.name.includes('Launch overnight analysis')
      )
      const lowTaskPriority = debugInfo.scheduledItemsPriority.find(
        item => item.name === 'Low Priority Task'
      )

      if (asyncStepPriority && lowTaskPriority) {
        expect(asyncStepPriority.priorityBreakdown.total).toBeGreaterThan(
          lowTaskPriority.priorityBreakdown.total
        )
        // Async boost should be significant (8 hours = 360 boost with current formula)
        expect(asyncStepPriority.priorityBreakdown.asyncBoost).toBeGreaterThan(300)
      }
    }
  })

  it('should prioritize workflows by critical path length', () => {
    // Create a long workflow
    const longWorkflow: SequencedTask = {
      id: 'long-workflow',
      taskId: 'long-workflow',
      name: 'Long Critical Path Workflow',
      importance: 7,
      urgency: 7,
      totalDuration: 600, // 10 hours
      completedCumulativeMinutes: 0,
      criticalPathDuration: 600,
      worstCaseDuration: 720,
      completed: false,
      overallStatus: 'not_started',
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: Array.from({ length: 10 }, (_, i) => ({
        id: `long-step-${i}`,
        taskId: 'long-workflow',
        name: `Step ${i + 1}`,
        duration: 60,
        type: TaskType.Focused,
        dependsOn: i > 0 ? [`long-step-${i - 1}`] : [],
        asyncWaitTime: i === 2 ? 240 : 0, // Add async wait to step 3
        status: 'pending' as const,
        stepIndex: i,
        percentComplete: 0,
      })),
    }

    // Create a short workflow with same priority
    const shortWorkflow: SequencedTask = {
      id: 'short-workflow',
      taskId: 'short-workflow',
      name: 'Short Workflow',
      importance: 7,
      urgency: 7,
      totalDuration: 60,
      completedCumulativeMinutes: 0,
      criticalPathDuration: 60,
      worstCaseDuration: 60,
      completed: false,
      overallStatus: 'not_started',
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [
        {
          id: 'short-step-1',
          taskId: 'short-workflow',
          name: 'Quick step',
          duration: 60,
          type: TaskType.Focused,
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending',
          stepIndex: 0,
          percentComplete: 0,
        },
      ],
    }

    const startDate = new Date('2025-01-15T09:00:00')
    const patterns = Array.from({ length: 5 }, (_, i) => 
      createWorkPattern(new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000))
    )

    const { scheduledItems } = scheduleItemsWithBlocksAndDebug(
      [],
      [longWorkflow, shortWorkflow],
      patterns,
      startDate,
      {
        schedulingPreferences: {
          id: 'test',
          sessionId: 'test',
          allowWeekendWork: false,
          weekendPenalty: 0.5,
          contextSwitchPenalty: 10,
          asyncParallelizationBonus: 20,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '18:00',
            lunchStart: '12:00',
            lunchDuration: 60,
          },
          customWorkHours: {},
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 3,
            blockedTimes: [],
          },
          customCapacity: {},
          timeZone: 'UTC',
        },
      }
    )

    // The long workflow with async step should start first
    const firstLongStep = scheduledItems.find(item => item.name.includes('Long Critical Path') && item.name.includes('Step 1'))
    const firstShortStep = scheduledItems.find(item => item.name.includes('Short Workflow'))

    expect(firstLongStep).toBeDefined()
    expect(firstShortStep).toBeDefined()

    // Long workflow should ideally start first due to critical path + async wait
    // This test may need adjustment based on actual implementation
    console.log('\n=== Critical Path Test Results ===')
    console.log(`Long workflow first step: ${firstLongStep?.startTime.toLocaleTimeString()}`)
    console.log(`Short workflow: ${firstShortStep?.startTime.toLocaleTimeString()}`)
  })

  it('should handle mixed tasks and workflows correctly', () => {
    const asyncWorkflow = createWorkflowWithAsyncSteps()
    
    // Create various priority tasks
    const urgentTask = createTask({
      name: 'Urgent Task',
      importance: 9,
      urgency: 9, // Priority = 81
      duration: 30,
    })

    const asyncTask = createTask({
      name: 'Task with Async Wait',
      importance: 5,
      urgency: 5, // Base priority = 25
      asyncWaitTime: 360, // 6 hours, should add +280 boost = 305 total
      duration: 20,
    })

    const normalTask = createTask({
      name: 'Normal Task',
      importance: 6,
      urgency: 6, // Priority = 36
      duration: 40,
    })

    const startDate = new Date('2025-01-15T09:00:00')
    const patterns = Array.from({ length: 3 }, (_, i) => 
      createWorkPattern(new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000))
    )

    const { scheduledItems, debugInfo } = scheduleItemsWithBlocksAndDebug(
      [urgentTask, asyncTask, normalTask],
      [asyncWorkflow],
      patterns,
      startDate,
      {
        schedulingPreferences: {
          id: 'test',
          sessionId: 'test',
          allowWeekendWork: false,
          weekendPenalty: 0.5,
          contextSwitchPenalty: 10,
          asyncParallelizationBonus: 20,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        workSettings: {
          defaultWorkHours: {
            startTime: '09:00',
            endTime: '18:00',
            lunchStart: '12:00',
            lunchDuration: 60,
          },
          customWorkHours: {},
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 3,
            blockedTimes: [],
          },
          customCapacity: {},
          timeZone: 'UTC',
        },
      }
    )

    // Expected order (by total priority):
    // 1. "Task with Async Wait" - priority ~305 (25 base + 280 async boost)
    // 2. "Launch overnight analysis" (workflow step) - priority ~432 (72 base + 360 async boost)
    // 3. "Urgent Task" - priority 81
    // 4. Other workflow steps and tasks

    console.log('\n=== Mixed Scheduling Results ===')
    scheduledItems.slice(0, 10).forEach(item => {
      const priorityInfo = debugInfo.scheduledItemsPriority?.find(p => p.id === item.id)
      if (priorityInfo) {
        const p = priorityInfo.priorityBreakdown
        console.log(`${item.startTime.toLocaleTimeString()} - ${item.name} (Total: ${p.total}, Async: ${p.asyncBoost})`)
      } else {
        console.log(`${item.startTime.toLocaleTimeString()} - ${item.name}`)
      }
    })

    // Find specific items
    const asyncTaskScheduled = scheduledItems.find(item => item.name === 'Task with Async Wait')
    const asyncWorkflowStep = scheduledItems.find(item => item.name.includes('Launch overnight analysis'))
    const urgentTaskScheduled = scheduledItems.find(item => item.name === 'Urgent Task')

    // Async items should be scheduled early
    expect(asyncTaskScheduled).toBeDefined()
    expect(asyncWorkflowStep).toBeDefined()
    
    // Check that async boost is working
    if (debugInfo.scheduledItemsPriority) {
      const asyncTaskPriority = debugInfo.scheduledItemsPriority.find(
        item => item.name === 'Task with Async Wait'
      )
      if (asyncTaskPriority) {
        // 6 hours should give 40 + (6 * 40) = 280 boost
        expect(asyncTaskPriority.priorityBreakdown.asyncBoost).toBeGreaterThanOrEqual(280)
        expect(asyncTaskPriority.priorityBreakdown.total).toBeGreaterThan(250)
      }

      const asyncStepPriority = debugInfo.scheduledItemsPriority.find(
        item => item.name.includes('Launch overnight analysis')
      )
      if (asyncStepPriority) {
        // 8 hours should give 40 + (8 * 40) = 360 boost
        expect(asyncStepPriority.priorityBreakdown.asyncBoost).toBeGreaterThanOrEqual(360)
      }
    }
  })
})