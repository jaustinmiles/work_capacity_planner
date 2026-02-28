import { describe, it, expect } from 'vitest'
import {
  getCrossEndeavorDependencies,
  isEndeavorBlocked,
  getBlockingEndeavors,
  suggestEndeavorStatus,
} from '../endeavor-utils'
import { EndeavorStatus, TaskStatus } from '../enums'
import type { Task, EndeavorWithTasks, EndeavorItem } from '../types'

// =============================================================================
// Test Helpers
// =============================================================================

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    duration: 30,
    importance: 5,
    urgency: 5,
    type: 'focused',
    category: 'default',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    hasSteps: false,
    overallStatus: TaskStatus.NotStarted,
    criticalPathDuration: 0,
    worstCaseDuration: 0,
    archived: false,
    inActiveSprint: false,
    sessionId: 'session-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    isLocked: false,
    ...overrides,
  }
}

function makeEndeavorItem(taskId: string, task: Task): EndeavorItem & { task: Task } {
  return {
    id: `item-${taskId}`,
    endeavorId: 'end-1',
    taskId,
    sortOrder: 0,
    addedAt: new Date('2024-01-01'),
    task,
  }
}

function makeEndeavor(
  id: string,
  items: Array<EndeavorItem & { task: Task }>,
  overrides: Partial<EndeavorWithTasks> = {},
): EndeavorWithTasks {
  return {
    id,
    name: `Endeavor ${id}`,
    status: EndeavorStatus.Active,
    importance: 5,
    urgency: 5,
    sessionId: 'session-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    items,
    ...overrides,
  }
}

// =============================================================================
// getCrossEndeavorDependencies
// =============================================================================

describe('getCrossEndeavorDependencies', () => {
  it('returns empty array when task has no dependencies', () => {
    const task = makeTask('t1')
    const endeavor = makeEndeavor('e1', [makeEndeavorItem('t1', task)])

    expect(getCrossEndeavorDependencies(task, endeavor, [endeavor])).toEqual([])
  })

  it('returns empty array when dependencies are within same endeavor', () => {
    const depTask = makeTask('t1')
    const task = makeTask('t2', { dependencies: ['t1'] })
    const endeavor = makeEndeavor('e1', [
      makeEndeavorItem('t1', depTask),
      makeEndeavorItem('t2', task),
    ])

    expect(getCrossEndeavorDependencies(task, endeavor, [endeavor])).toEqual([])
  })

  it('detects cross-endeavor dependency', () => {
    const depTask = makeTask('t-dep', { name: 'Dependency' })
    const task = makeTask('t1', { dependencies: ['t-dep'] })

    const endeavorA = makeEndeavor('e-a', [makeEndeavorItem('t1', task)], { name: 'Endeavor A' })
    const endeavorB = makeEndeavor('e-b', [makeEndeavorItem('t-dep', depTask)], { name: 'Endeavor B' })

    const result = getCrossEndeavorDependencies(task, endeavorA, [endeavorA, endeavorB])

    expect(result).toHaveLength(1)
    expect(result[0]!.dependencyId).toBe('t-dep')
    expect(result[0]!.dependencyName).toBe('Dependency')
    expect(result[0]!.endeavorId).toBe('e-b')
    expect(result[0]!.endeavorName).toBe('Endeavor B')
    expect(result[0]!.isCompleted).toBe(false)
  })

  it('marks completed cross-endeavor dependencies correctly', () => {
    const depTask = makeTask('t-dep', { completed: true })
    const task = makeTask('t1', { dependencies: ['t-dep'] })

    const endeavorA = makeEndeavor('e-a', [makeEndeavorItem('t1', task)])
    const endeavorB = makeEndeavor('e-b', [makeEndeavorItem('t-dep', depTask)])

    const result = getCrossEndeavorDependencies(task, endeavorA, [endeavorA, endeavorB])

    expect(result[0]!.isCompleted).toBe(true)
  })

  it('ignores dependencies not found in any endeavor', () => {
    const task = makeTask('t1', { dependencies: ['nonexistent'] })
    const endeavor = makeEndeavor('e1', [makeEndeavorItem('t1', task)])

    expect(getCrossEndeavorDependencies(task, endeavor, [endeavor])).toEqual([])
  })
})

// =============================================================================
// isEndeavorBlocked
// =============================================================================

describe('isEndeavorBlocked', () => {
  it('returns false when no tasks have cross-endeavor dependencies', () => {
    const task = makeTask('t1')
    const endeavor = makeEndeavor('e1', [makeEndeavorItem('t1', task)])

    expect(isEndeavorBlocked(endeavor, [endeavor])).toBe(false)
  })

  it('returns true when an incomplete task has incomplete cross-endeavor dependency', () => {
    const depTask = makeTask('t-dep')
    const task = makeTask('t1', { dependencies: ['t-dep'] })

    const endeavorA = makeEndeavor('e-a', [makeEndeavorItem('t1', task)])
    const endeavorB = makeEndeavor('e-b', [makeEndeavorItem('t-dep', depTask)])

    expect(isEndeavorBlocked(endeavorA, [endeavorA, endeavorB])).toBe(true)
  })

  it('returns false when cross-endeavor dependency is completed', () => {
    const depTask = makeTask('t-dep', { completed: true })
    const task = makeTask('t1', { dependencies: ['t-dep'] })

    const endeavorA = makeEndeavor('e-a', [makeEndeavorItem('t1', task)])
    const endeavorB = makeEndeavor('e-b', [makeEndeavorItem('t-dep', depTask)])

    expect(isEndeavorBlocked(endeavorA, [endeavorA, endeavorB])).toBe(false)
  })

  it('skips completed tasks when checking blocks', () => {
    const depTask = makeTask('t-dep')
    const task = makeTask('t1', { dependencies: ['t-dep'], completed: true })

    const endeavorA = makeEndeavor('e-a', [makeEndeavorItem('t1', task)])
    const endeavorB = makeEndeavor('e-b', [makeEndeavorItem('t-dep', depTask)])

    expect(isEndeavorBlocked(endeavorA, [endeavorA, endeavorB])).toBe(false)
  })
})

// =============================================================================
// getBlockingEndeavors
// =============================================================================

describe('getBlockingEndeavors', () => {
  it('returns empty array when no blockers exist', () => {
    const task = makeTask('t1')
    const endeavor = makeEndeavor('e1', [makeEndeavorItem('t1', task)])

    expect(getBlockingEndeavors(endeavor, [endeavor])).toEqual([])
  })

  it('returns blocking endeavor with count', () => {
    const depTask = makeTask('t-dep', { name: 'Dep Task' })
    const task = makeTask('t1', { dependencies: ['t-dep'] })

    const endeavorA = makeEndeavor('e-a', [makeEndeavorItem('t1', task)])
    const endeavorB = makeEndeavor('e-b', [makeEndeavorItem('t-dep', depTask)], { name: 'Blocker' })

    const result = getBlockingEndeavors(endeavorA, [endeavorA, endeavorB])

    expect(result).toHaveLength(1)
    expect(result[0]!.endeavorId).toBe('e-b')
    expect(result[0]!.endeavorName).toBe('Blocker')
    expect(result[0]!.blockingTaskCount).toBe(1)
  })

  it('aggregates multiple blocking tasks from same endeavor', () => {
    const dep1 = makeTask('t-dep1')
    const dep2 = makeTask('t-dep2')
    const task1 = makeTask('t1', { dependencies: ['t-dep1'] })
    const task2 = makeTask('t2', { dependencies: ['t-dep2'] })

    const endeavorA = makeEndeavor('e-a', [
      makeEndeavorItem('t1', task1),
      makeEndeavorItem('t2', task2),
    ])
    const endeavorB = makeEndeavor('e-b', [
      makeEndeavorItem('t-dep1', dep1),
      makeEndeavorItem('t-dep2', dep2),
    ], { name: 'Blocker' })

    const result = getBlockingEndeavors(endeavorA, [endeavorA, endeavorB])

    expect(result).toHaveLength(1)
    expect(result[0]!.blockingTaskCount).toBe(2)
  })

  it('ignores completed cross-endeavor dependencies', () => {
    const depTask = makeTask('t-dep', { completed: true })
    const task = makeTask('t1', { dependencies: ['t-dep'] })

    const endeavorA = makeEndeavor('e-a', [makeEndeavorItem('t1', task)])
    const endeavorB = makeEndeavor('e-b', [makeEndeavorItem('t-dep', depTask)])

    expect(getBlockingEndeavors(endeavorA, [endeavorA, endeavorB])).toEqual([])
  })
})

// =============================================================================
// suggestEndeavorStatus
// =============================================================================

describe('suggestEndeavorStatus', () => {
  it('returns Active for empty endeavor', () => {
    const endeavor = makeEndeavor('e1', [])

    expect(suggestEndeavorStatus(endeavor)).toBe(EndeavorStatus.Active)
  })

  it('returns Completed when all tasks are completed', () => {
    const t1 = makeTask('t1', { completed: true, actualDuration: 25 })
    const t2 = makeTask('t2', { completed: true, actualDuration: 20 })
    const endeavor = makeEndeavor('e1', [
      makeEndeavorItem('t1', t1),
      makeEndeavorItem('t2', t2),
    ])

    expect(suggestEndeavorStatus(endeavor)).toBe(EndeavorStatus.Completed)
  })

  it('returns Active when currently Completed but has incomplete tasks', () => {
    const t1 = makeTask('t1', { completed: true, actualDuration: 25 })
    const t2 = makeTask('t2')
    const endeavor = makeEndeavor('e1', [
      makeEndeavorItem('t1', t1),
      makeEndeavorItem('t2', t2),
    ], { status: EndeavorStatus.Completed })

    expect(suggestEndeavorStatus(endeavor)).toBe(EndeavorStatus.Active)
  })

  it('returns current status when partially complete and not marked Completed', () => {
    const t1 = makeTask('t1', { completed: true, actualDuration: 25 })
    const t2 = makeTask('t2')
    const endeavor = makeEndeavor('e1', [
      makeEndeavorItem('t1', t1),
      makeEndeavorItem('t2', t2),
    ], { status: EndeavorStatus.Active })

    expect(suggestEndeavorStatus(endeavor)).toBe(EndeavorStatus.Active)
  })

  it('returns Paused status when endeavor is paused and not all complete', () => {
    const t1 = makeTask('t1')
    const endeavor = makeEndeavor('e1', [
      makeEndeavorItem('t1', t1),
    ], { status: EndeavorStatus.Paused })

    expect(suggestEndeavorStatus(endeavor)).toBe(EndeavorStatus.Paused)
  })
})
