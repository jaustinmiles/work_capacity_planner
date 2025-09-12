/**
 * Priority Calculation Verification Test
 *
 * This test verifies whether the "Trader Joe's bug" mentioned in documentation actually exists.
 * The bug is described as using multiplicative deadline pressure instead of additive.
 *
 * Following TDD pattern: Write failing test first to verify the bug exists.
 */

import { describe, it, expect } from 'vitest'
import { Task } from '@shared/types'
import { TaskType } from '@shared/enums'
import { calculatePriorityWithBreakdown, SchedulingContext } from '../deadline-scheduler'

describe.skip('Priority Calculation Bug Verification (Trader Joes Bug)', () => {
  const mockContext: SchedulingContext = {
    tasks: [],
    workflows: [],
    workPatterns: [],
    productivityPatterns: [],
    schedulingPreferences: {
      contextSwitchPenalty: 10,
      cognitiveLoadPreference: 0.5,
    },
    workSettings: {
      defaultCapacity: {
        maxFocusHours: 4,
        maxAdminHours: 3,
      },
      defaultWorkHours: {
        startTime: '09:00',
        endTime: '18:00',
      },
      customWorkHours: {},
    } as any,
    currentTime: new Date('2025-01-10T10:00:00Z'),
    lastScheduledItem: null,
  }

  it('should demonstrate if multiplicative vs additive deadline pressure bug exists', () => {
    // Create two tasks:
    // 1. High priority task (importance: 9, urgency: 9) with no deadline pressure
    // 2. Low priority task (importance: 2, urgency: 2) with high deadline pressure

    const highPriorityTask: Task = {
      id: 'high-priority',
      name: 'Important Development Work',
      importance: 9,
      urgency: 9,
      duration: 120,
      type: TaskType.FOCUSED,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: false,
      createdAt: new Date('2025-01-10T09:00:00Z'),
      // No deadline - so no deadline pressure
    }

    const lowPriorityTask: Task = {
      id: 'trader-joes',
      name: 'Trader Joes Shopping',
      importance: 2,
      urgency: 2,
      duration: 60,
      type: TaskType.PERSONAL,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: false,
      createdAt: new Date('2025-01-10T09:00:00Z'),
      // Tight deadline - creates high deadline pressure
      deadline: new Date('2025-01-10T11:00:00Z'), // 1 hour from current time
      deadlineType: 'hard',
    }

    const highPriorityResult = calculatePriorityWithBreakdown(highPriorityTask, mockContext)
    const lowPriorityResult = calculatePriorityWithBreakdown(lowPriorityTask, mockContext)

    console.log('High Priority Task (no deadline):')
    console.log(`  Eisenhower: ${highPriorityResult.eisenhower}`)
    console.log(`  Deadline Boost: ${highPriorityResult.deadlineBoost}`)
    console.log(`  Total: ${highPriorityResult.total}`)

    console.log('Low Priority Task (tight deadline):')
    console.log(`  Eisenhower: ${lowPriorityResult.eisenhower}`)
    console.log(`  Deadline Boost: ${lowPriorityResult.deadlineBoost}`)
    console.log(`  Total: ${lowPriorityResult.total}`)

    // EXPECTED BEHAVIOR (additive formula):
    // High Priority: 9 * 9 = 81 (no deadline boost)
    // Low Priority: 2 * 2 = 4 + (large deadline boost)
    // The deadline boost should be large enough to make low priority task win

    // BUGGY BEHAVIOR (multiplicative formula):
    // High Priority: 9 * 9 * 1 = 81 (no deadline pressure)
    // Low Priority: 2 * 2 * (large deadline pressure) = still relatively small
    // High priority task would win incorrectly

    // This test will fail if the bug exists (low priority task should win due to deadline)
    expect(lowPriorityResult.total).toBeGreaterThan(highPriorityResult.total)

    // Additional verification: deadline boost should be significant for urgent deadline
    expect(lowPriorityResult.deadlineBoost).toBeGreaterThan(0)
    expect(lowPriorityResult.deadlineBoost).toBeGreaterThan(50) // Should be substantial
  })

  it('should use additive deadline pressure formula', () => {
    const taskWithDeadline: Task = {
      id: 'deadline-task',
      name: 'Task with Deadline',
      importance: 3,
      urgency: 3,
      duration: 60,
      type: TaskType.FOCUSED,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: false,
      createdAt: new Date('2025-01-10T09:00:00Z'),
      deadline: new Date('2025-01-10T12:00:00Z'), // 2 hours from current time
      deadlineType: 'hard',
    }

    const result = calculatePriorityWithBreakdown(taskWithDeadline, mockContext)

    // For additive formula: priority = eisenhower + deadlineBoost + other factors
    // For multiplicative formula: priority = eisenhower * deadlinePressure + other factors

    const expectedAdditive = result.eisenhower + result.deadlineBoost + result.asyncBoost

    // Test will fail if multiplicative formula is used instead of additive
    expect(Math.abs(result.total - expectedAdditive)).toBeLessThan(50) // Allow for other factors
  })
})
