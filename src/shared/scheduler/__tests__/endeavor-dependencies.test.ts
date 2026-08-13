import { describe, it, expect } from 'vitest'
import {
  applyEndeavorDependencies,
  EndeavorDependencyEdge,
} from '../endeavor-dependencies'
import { allocateItems } from '../wavefront-allocator'
import { buildBlockTimeline } from '../block-timeline'
import { DailyWorkPattern } from '../../work-blocks-types'
import { BlockConfigKind, UnifiedScheduleItemType, StepStatus } from '../../enums'
import { UnifiedScheduleItem } from '../../unified-scheduler'

const FOCUS = 'type-focus'

function item(overrides: Partial<UnifiedScheduleItem> & { id: string }): UnifiedScheduleItem {
  return {
    name: overrides.id,
    type: UnifiedScheduleItemType.Task,
    duration: 30,
    priority: 50,
    taskTypeId: FOCUS,
    ...overrides,
  }
}

function edge(overrides: Partial<EndeavorDependencyEdge>): EndeavorDependencyEdge {
  return {
    blockingStepId: 'blocker-step',
    blockingTaskId: 'blocker-workflow',
    isHardBlock: true,
    ...overrides,
  }
}

describe('applyEndeavorDependencies', () => {
  it('adds the blocking step as a dependency of a blocked step', () => {
    const items = [
      item({ id: 'blocker-step', workflowId: 'blocker-workflow' }),
      item({ id: 'blocked-step', workflowId: 'other-workflow' }),
    ]
    const result = applyEndeavorDependencies(items, new Set(), [
      edge({ blockedStepId: 'blocked-step' }),
    ])
    const blocked = result.items.find((i) => i.id === 'blocked-step')
    expect(blocked?.dependencies).toEqual(['blocker-step'])
    expect(result.preBlocked.size).toBe(0)
  })

  it('blocks EVERY step of a blocked workflow', () => {
    const items = [
      item({ id: 'blocker-step', workflowId: 'blocker-workflow' }),
      item({ id: 'w-step-1', workflowId: 'blocked-workflow' }),
      item({ id: 'w-step-2', workflowId: 'blocked-workflow', dependencies: ['w-step-1'] }),
    ]
    const result = applyEndeavorDependencies(items, new Set(), [
      edge({ blockedTaskId: 'blocked-workflow' }),
    ])
    expect(result.items.find((i) => i.id === 'w-step-1')?.dependencies).toEqual([
      'blocker-step',
    ])
    expect(result.items.find((i) => i.id === 'w-step-2')?.dependencies).toEqual([
      'w-step-1',
      'blocker-step',
    ])
  })

  it('ignores soft blocks and completed/skipped blockers', () => {
    const items = [item({ id: 'blocked-step' })]
    const result = applyEndeavorDependencies(items, new Set(), [
      edge({ blockedStepId: 'blocked-step', isHardBlock: false }),
      edge({ blockedStepId: 'blocked-step', blockingStepStatus: StepStatus.Completed }),
      edge({ blockedStepId: 'blocked-step', blockingStepStatus: StepStatus.Skipped }),
    ])
    expect(result.items.find((i) => i.id === 'blocked-step')?.dependencies).toBeUndefined()
    expect(result.preBlocked.size).toBe(0)
  })

  it('treats a blocker in completedItemIds as resolvable (edge added, then satisfied)', () => {
    const items = [item({ id: 'blocked-step' })]
    const result = applyEndeavorDependencies(items, new Set(['blocker-step']), [
      edge({ blockedStepId: 'blocked-step' }),
    ])
    expect(result.items.find((i) => i.id === 'blocked-step')?.dependencies).toEqual([
      'blocker-step',
    ])
  })

  it('pre-blocks items whose blocker is neither loaded nor completed', () => {
    const items = [item({ id: 'blocked-step' })]
    const result = applyEndeavorDependencies(items, new Set(), [
      edge({ blockedStepId: 'blocked-step', blockingStepName: 'Ship API v2' }),
    ])
    expect(result.preBlocked.get('blocked-step')).toBe(
      'Blocked by endeavor dependency: Ship API v2',
    )
  })

  it('never creates a self-dependency', () => {
    const items = [item({ id: 'step-x' })]
    const result = applyEndeavorDependencies(items, new Set(), [
      edge({ blockedStepId: 'step-x', blockingStepId: 'step-x', blockingTaskId: 'step-x' }),
    ])
    expect(result.items.find((i) => i.id === 'step-x')?.dependencies).toBeUndefined()
  })
})

describe('endeavor dependencies through the allocator (end to end)', () => {
  const now = new Date('2026-07-31T08:00:00')
  const patterns: DailyWorkPattern[] = [
    {
      date: '2026-07-31',
      blocks: [
        {
          id: 'day',
          startTime: '09:00',
          endTime: '17:00',
          typeConfig: { kind: BlockConfigKind.Any },
        },
      ],
      accumulated: {},
      meetings: [],
    },
  ]

  it('a hard-blocked workflow schedules strictly after the blocking step', () => {
    const items = [
      item({ id: 'blocker-step', priority: 10, duration: 120, workflowId: 'wf-a' }),
      item({ id: 'blocked-step', priority: 99, workflowId: 'wf-b' }),
    ]
    const injection = applyEndeavorDependencies(items, new Set(), [
      edge({ blockedTaskId: 'wf-b' }),
    ])
    const result = allocateItems(
      injection.items,
      new Set(),
      buildBlockTimeline(patterns, now),
      now,
      { allowTaskSplitting: true, minimumSplitMinutes: 30 },
      injection.preBlocked,
    )
    const blocker = result.scheduled.find((s) => s.id === 'blocker-step')
    const blocked = result.scheduled.find((s) => s.id === 'blocked-step')
    expect(blocked!.startTime!.getTime()).toBeGreaterThanOrEqual(
      blocker!.endTime!.getTime(),
    )
  })

  it('an unresolved hard block keeps the item unscheduled with a clear reason', () => {
    const items = [item({ id: 'blocked-step', priority: 99 })]
    const injection = applyEndeavorDependencies(items, new Set(), [
      edge({ blockedStepId: 'blocked-step', blockingStepName: 'External step' }),
    ])
    const result = allocateItems(
      items,
      new Set(),
      buildBlockTimeline(patterns, now),
      now,
      { allowTaskSplitting: true, minimumSplitMinutes: 30 },
      injection.preBlocked,
    )
    expect(result.scheduled).toHaveLength(0)
    expect(result.unscheduled[0]?.reason).toBe(
      'Blocked by endeavor dependency: External step',
    )
  })
})
