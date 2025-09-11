/**
 * Unit test specifically for dependency resolution logic
 */

import { UnifiedScheduler } from '../unified-scheduler'
import { SequencedTask } from '../sequencing-types'
import { TaskType, StepStatus } from '../enums'

describe('UnifiedScheduler - Dependency Resolution Unit Tests', () => {
  let scheduler: UnifiedScheduler

  beforeEach(() => {
    scheduler = new UnifiedScheduler()
  })

  it('validateDependencies should accept completed dependencies', () => {
    const workflow: SequencedTask = {
      id: 'workflow-1',
      name: 'Test Workflow',
      duration: 120,
      importance: 5,
      urgency: 5,
      type: TaskType.Focused,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: true,
      overallStatus: 'in_progress' as any,
      criticalPathDuration: 120,
      worstCaseDuration: 150,
      sessionId: 'session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [
        {
          id: 'step-1',
          taskId: 'workflow-1',
          name: 'First Step',
          duration: 60,
          type: TaskType.Focused,
          dependsOn: [],
          asyncWaitTime: 0,
          status: StepStatus.Completed, // Completed
          stepIndex: 0,
          percentComplete: 100,
        },
        {
          id: 'step-2',
          taskId: 'workflow-1',
          name: 'Second Step',
          duration: 60,
          type: TaskType.Focused,
          dependsOn: ['step-1'], // Depends on completed step
          asyncWaitTime: 0,
          status: StepStatus.Pending,
          stepIndex: 1,
          percentComplete: 0,
        },
      ],
    }

    // Test conversion to unified items
    const { activeItems, completedItemIds } = (scheduler as any).convertToUnifiedItems([workflow])

    expect(activeItems.length).toBe(1) // Only step-2 should be active
    expect(activeItems[0].id).toBe('step-2')
    expect(completedItemIds.has('step-1')).toBe(true) // step-1 should be in completed set

    // Test dependency validation
    const validation = (scheduler as any).validateDependencies(activeItems, completedItemIds)

    expect(validation.isValid).toBe(true)
    expect(validation.errors.length).toBe(0)
  })

  it('validateDependencies should reject missing dependencies', () => {
    const workflow: SequencedTask = {
      id: 'workflow-1',
      name: 'Test Workflow',
      duration: 60,
      importance: 5,
      urgency: 5,
      type: TaskType.Focused,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: true,
      overallStatus: 'pending' as any,
      criticalPathDuration: 60,
      worstCaseDuration: 70,
      sessionId: 'session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [
        {
          id: 'step-2',
          taskId: 'workflow-1',
          name: 'Second Step',
          duration: 60,
          type: TaskType.Focused,
          dependsOn: ['step-1'], // Depends on missing step
          asyncWaitTime: 0,
          status: StepStatus.Pending,
          stepIndex: 1,
          percentComplete: 0,
        },
      ],
    }

    // Test conversion to unified items
    const { activeItems, completedItemIds } = (scheduler as any).convertToUnifiedItems([workflow])

    expect(activeItems.length).toBe(1) // Only step-2
    expect(completedItemIds.has('step-1')).toBe(false) // step-1 should NOT be in completed set

    // Test dependency validation
    const validation = (scheduler as any).validateDependencies(activeItems, completedItemIds)

    expect(validation.isValid).toBe(false)
    expect(validation.errors.length).toBe(1)
    expect(validation.errors[0].description).toContain('missing item "step-1"')
  })
})
