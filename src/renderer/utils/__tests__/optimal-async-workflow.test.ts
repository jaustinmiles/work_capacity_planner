import { describe, it, expect } from 'vitest'
import { generateOptimalSchedule, OptimalScheduleConfig } from '../optimal-scheduler'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'

describe('Optimal Schedule - Async Workflow Test', () => {
  const createTask = (overrides: Partial<Task>): Task => ({
    id: `task-${Math.random()}`,
    name: 'Test Task',
    importance: 5,
    urgency: 5,
    type: TaskType.Focused,
    duration: 60,
    completed: false,
    cognitiveComplexity: 3,
    hasSteps: false,
    asyncWaitTime: 0,
    isAsyncTrigger: false,
    dependencies: [],
    sessionId: 'test-session',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  const createWorkflow = (overrides: Partial<SequencedTask>): SequencedTask => ({
    id: `workflow-${Math.random()}`,
    name: 'Test Workflow',
    type: TaskType.Focused,
    importance: 5,
    urgency: 5,
    completed: false,
    steps: [],
    dependencies: [],
    sessionId: 'test-session',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  it('should optimize async workflows by starting early and resuming after async wait', () => {
    const startTime = new Date('2025-09-01T08:00:00') // Monday 8am
    const config: OptimalScheduleConfig = {
      sleepStart: '23:00',
      sleepEnd: '07:00',
      meetings: [],
    }

    // Create two workflows with async waits
    const workflow1 = createWorkflow({
      id: 'workflow-1',
      name: 'Deploy Service A',
      steps: [
        {
          id: 'step-1-1',
          name: 'Trigger deployment',
          duration: 30,
          description: 'Start the deployment pipeline',
          status: 'not_started',
          isAsyncTrigger: true,
          asyncWaitTime: 1440, // 24 hour wait (1 day)
        },
        {
          id: 'step-1-2',
          name: 'Verify deployment',
          duration: 30,
          description: 'Check deployment succeeded',
          dependsOn: ['step-1-1'],
          status: 'not_started',
        },
      ],
    })

    const workflow2 = createWorkflow({
      id: 'workflow-2',
      name: 'Deploy Service B',
      steps: [
        {
          id: 'step-2-1',
          name: 'Trigger deployment',
          duration: 30,
          description: 'Start the deployment pipeline',
          status: 'not_started',
          isAsyncTrigger: true,
          asyncWaitTime: 1440, // 24 hour wait (1 day)
        },
        {
          id: 'step-2-2',
          name: 'Verify deployment',
          duration: 30,
          description: 'Check deployment succeeded',
          dependsOn: ['step-2-1'],
          status: 'not_started',
        },
      ],
    })

    const result = generateOptimalSchedule([], [workflow1, workflow2], startTime, config)

    // Debug output
    console.log('Schedule items:')
    result.schedule.forEach(item => {
      console.log(`  ${item.name}: ${item.startTime.toISOString()} - ${item.endTime.toISOString()} (type: ${item.type})`)
    })

    console.log('\nBlocks generated:')
    result.blocks.forEach(block => {
      console.log(`  ${block.date} ${block.startTime.toTimeString().slice(0,5)}-${block.endTime.toTimeString().slice(0,5)} (${block.type})`)
    })

    // Check that we have scheduled items
    expect(result.schedule.length).toBeGreaterThan(0)

    // Find the trigger tasks
    const trigger1 = result.schedule.find(item => item.name.includes('Deploy Service A') && item.name.includes('Trigger'))
    const trigger2 = result.schedule.find(item => item.name.includes('Deploy Service B') && item.name.includes('Trigger'))
    const verify1 = result.schedule.find(item => item.name.includes('Deploy Service A') && item.name.includes('Verify'))
    const verify2 = result.schedule.find(item => item.name.includes('Deploy Service B') && item.name.includes('Verify'))

    // Both triggers should be scheduled early (on day 1)
    expect(trigger1).toBeDefined()
    expect(trigger2).toBeDefined()
    expect(trigger1!.startTime.getDate()).toBe(1) // September 1st
    expect(trigger2!.startTime.getDate()).toBe(1) // September 1st

    // Both triggers should be in the morning to maximize async time
    expect(trigger1!.startTime.getHours()).toBeLessThanOrEqual(9)
    expect(trigger2!.startTime.getHours()).toBeLessThanOrEqual(9)

    // Verify tasks should be scheduled after the async wait (on day 2)
    expect(verify1).toBeDefined()
    expect(verify2).toBeDefined()
    expect(verify1!.startTime.getDate()).toBe(2) // September 2nd
    expect(verify2!.startTime.getDate()).toBe(2) // September 2nd

    // Check that we have async wait blocks
    const asyncWaits = result.schedule.filter(item => item.type === 'async-wait')
    expect(asyncWaits.length).toBe(2) // One for each workflow

    // Check the blocks generated
    expect(result.blocks.length).toBeGreaterThan(0)

    // Should have work blocks on day 1 (for triggers)
    const day1Blocks = result.blocks.filter(b => b.date === '2025-09-01')
    expect(day1Blocks.length).toBeGreaterThan(0)
    expect(day1Blocks.some(b => b.type === 'work')).toBe(true)

    // Should NOT have work blocks during the async wait (most of day 1 after triggers)
    // But SHOULD have work blocks on day 2 (for verification)
    const day2Blocks = result.blocks.filter(b => b.date === '2025-09-02')
    expect(day2Blocks.length).toBeGreaterThan(0)
    expect(day2Blocks.some(b => b.type === 'work')).toBe(true)

    // Verify the optimization metrics
    expect(result.metrics.asyncParallelTime).toBeGreaterThan(0)

    // Both workflows should complete as soon as possible after async wait
    const lastEnd = Math.max(...result.schedule.map(item => item.endTime.getTime()))
    const expectedEnd = new Date('2025-09-02T09:00:00').getTime() // Next day 9am (1 hour for both verifications)

    // Should complete within an hour of the expected time
    expect(lastEnd).toBeLessThanOrEqual(expectedEnd + 60 * 60 * 1000)
  })

  it('should not create unnecessary work blocks during async wait periods', () => {
    const startTime = new Date('2025-09-01T08:00:00')
    const config: OptimalScheduleConfig = {
      sleepStart: '23:00',
      sleepEnd: '07:00',
      meetings: [],
    }

    // Single task with long async wait
    const task = createTask({
      name: 'Deploy with long wait',
      duration: 30,
      isAsyncTrigger: true,
      asyncWaitTime: 2880, // 48 hour wait (2 days)
    })

    const result = generateOptimalSchedule([task], [], startTime, config)

    // Should schedule the task immediately
    expect(result.schedule[0].startTime.getDate()).toBe(1)

    // Should have minimal work blocks - only when actually working
    const workBlocks = result.blocks.filter(b => b.type === 'work')

    // Should only have work block on day 1 (for the initial task)
    // No work blocks needed on days 2-3 during async wait
    expect(workBlocks.every(b => b.date === '2025-09-01')).toBe(true)

    // Total work time should just be the task duration
    expect(result.metrics.activeWorkTime).toBe(30)
  })
})
