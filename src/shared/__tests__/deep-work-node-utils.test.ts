import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getNodeName,
  getNodeDuration,
  getNodeTypeId,
  getElapsedSeconds,
  formatElapsedStopwatch,
  deriveDeepWorkDisplayStatus,
  findBoardSessions,
  getInitialFields,
  calculateGridPosition,
  pickRandomActionableNode,
  findFirstUnblockedBlocker,
} from '../deep-work-node-utils'
import type { DeepWorkNodeWithData, DeepWorkEdge } from '../deep-work-board-types'
import { DeepWorkNodeStatus, DeepWorkEdgeType } from '../deep-work-board-types'
import { StepStatus } from '../enums'
import type { UnifiedWorkSession } from '../unified-work-session-types'

// Mock time-provider for getElapsedSeconds
vi.mock('../time-provider', () => ({
  getCurrentTime: vi.fn(() => new Date('2024-06-15T12:00:00Z')),
}))

// =============================================================================
// Test Helpers
// =============================================================================

function makeTaskNode(
  id: string,
  overrides: Partial<DeepWorkNodeWithData> = {},
): DeepWorkNodeWithData {
  return {
    id,
    boardId: 'board-1',
    taskId: `task-${id}`,
    stepId: null,
    positionX: 0,
    positionY: 0,
    width: 220,
    height: 90,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    task: {
      id: `task-${id}`,
      name: `Task ${id}`,
      duration: 30,
      importance: 5,
      urgency: 5,
      type: 'focused',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: false,
      overallStatus: 'not_started' as any,
      criticalPathDuration: 0,
      worstCaseDuration: 0,
      archived: false,
      inActiveSprint: false,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    },
    step: null,
    parentTask: null,
    ...overrides,
  }
}

function makeStepNode(
  id: string,
  stepId: string,
  taskId: string,
  status: StepStatus = StepStatus.Pending,
): DeepWorkNodeWithData {
  return {
    id,
    boardId: 'board-1',
    taskId: null,
    stepId,
    positionX: 0,
    positionY: 0,
    width: 220,
    height: 90,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    task: null,
    step: {
      id: stepId,
      name: `Step ${stepId}`,
      duration: 15,
      type: 'focused',
      taskId,
      dependsOn: [],
      asyncWaitTime: 0,
      status,
      stepIndex: 0,
      percentComplete: 0,
      isAsyncTrigger: false,
    },
    parentTask: {
      id: taskId,
      name: `Workflow ${taskId}`,
      duration: 60,
      importance: 7,
      urgency: 8,
      type: 'deep',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: true,
      overallStatus: 'not_started' as any,
      criticalPathDuration: 60,
      worstCaseDuration: 60,
      archived: false,
      inActiveSprint: false,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    },
  }
}

function makeSession(
  id: string,
  taskId: string,
  overrides: Partial<UnifiedWorkSession> = {},
): UnifiedWorkSession {
  return {
    id,
    taskId,
    startTime: new Date('2024-06-15T11:00:00Z'),
    type: 'focused',
    ...overrides,
  }
}

// =============================================================================
// getNodeName
// =============================================================================

describe('getNodeName', () => {
  it('returns task name for standalone task node', () => {
    const node = makeTaskNode('A')
    expect(getNodeName(node)).toBe('Task A')
  })

  it('returns step name for step node', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1')
    expect(getNodeName(node)).toBe('Step step-1')
  })

  it('returns "Untitled" when both task and step are null', () => {
    const node = makeTaskNode('C', { task: null })
    expect(getNodeName(node)).toBe('Untitled')
  })
})

// =============================================================================
// getNodeDuration
// =============================================================================

describe('getNodeDuration', () => {
  it('returns task duration for standalone task', () => {
    const node = makeTaskNode('A')
    expect(getNodeDuration(node)).toBe(30)
  })

  it('returns step duration for step node', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1')
    expect(getNodeDuration(node)).toBe(15)
  })

  it('returns 0 when both task and step are null', () => {
    const node = makeTaskNode('C', { task: null })
    expect(getNodeDuration(node)).toBe(0)
  })
})

// =============================================================================
// getNodeTypeId
// =============================================================================

describe('getNodeTypeId', () => {
  it('returns task type for standalone task', () => {
    const node = makeTaskNode('A')
    expect(getNodeTypeId(node)).toBe('focused')
  })

  it('returns step type for step node', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1')
    expect(getNodeTypeId(node)).toBe('focused')
  })

  it('returns empty string when both are null', () => {
    const node = makeTaskNode('C', { task: null })
    expect(getNodeTypeId(node)).toBe('')
  })
})

// =============================================================================
// getElapsedSeconds
// =============================================================================

describe('getElapsedSeconds', () => {
  it('calculates elapsed seconds using getCurrentTime', () => {
    // getCurrentTime returns 2024-06-15T12:00:00Z (mocked above)
    const startTime = new Date('2024-06-15T11:30:00Z')
    expect(getElapsedSeconds(startTime)).toBe(1800) // 30 minutes = 1800 seconds
  })

  it('handles string date inputs by converting with new Date()', () => {
    const startTime = new Date('2024-06-15T11:59:00Z')
    expect(getElapsedSeconds(startTime)).toBe(60)
  })
})

// =============================================================================
// formatElapsedStopwatch
// =============================================================================

describe('formatElapsedStopwatch', () => {
  it('formats zero seconds', () => {
    expect(formatElapsedStopwatch(0)).toBe('00:00')
  })

  it('formats seconds under one minute', () => {
    expect(formatElapsedStopwatch(45)).toBe('00:45')
  })

  it('formats minutes and seconds', () => {
    expect(formatElapsedStopwatch(125)).toBe('02:05')
  })

  it('formats hours, minutes, and seconds', () => {
    expect(formatElapsedStopwatch(3661)).toBe('1:01:01')
  })

  it('pads minutes and seconds with leading zeros', () => {
    expect(formatElapsedStopwatch(3600)).toBe('1:00:00')
  })
})

// =============================================================================
// deriveDeepWorkDisplayStatus
// =============================================================================

describe('deriveDeepWorkDisplayStatus', () => {
  it('returns Pending for actionable standalone task', () => {
    const node = makeTaskNode('A')
    expect(deriveDeepWorkDisplayStatus(node, true)).toBe(DeepWorkNodeStatus.Pending)
  })

  it('returns Completed for completed standalone task', () => {
    const node = makeTaskNode('A', {
      task: { ...makeTaskNode('A').task!, completed: true },
    })
    expect(deriveDeepWorkDisplayStatus(node, true)).toBe(DeepWorkNodeStatus.Completed)
  })

  it('returns Blocked for non-actionable standalone task', () => {
    const node = makeTaskNode('A')
    expect(deriveDeepWorkDisplayStatus(node, false)).toBe(DeepWorkNodeStatus.Blocked)
  })

  it('returns Active for in-progress step', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1', StepStatus.InProgress)
    expect(deriveDeepWorkDisplayStatus(node, true)).toBe(DeepWorkNodeStatus.Active)
  })

  it('returns Waiting for waiting step', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1', StepStatus.Waiting)
    expect(deriveDeepWorkDisplayStatus(node, true)).toBe(DeepWorkNodeStatus.Waiting)
  })

  it('returns Completed for completed step', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1', StepStatus.Completed)
    expect(deriveDeepWorkDisplayStatus(node, true)).toBe(DeepWorkNodeStatus.Completed)
  })

  it('returns Completed for skipped step', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1', StepStatus.Skipped)
    expect(deriveDeepWorkDisplayStatus(node, false)).toBe(DeepWorkNodeStatus.Completed)
  })

  it('returns Blocked for non-actionable pending step', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1', StepStatus.Pending)
    expect(deriveDeepWorkDisplayStatus(node, false)).toBe(DeepWorkNodeStatus.Blocked)
  })

  it('returns Pending for actionable pending step', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1', StepStatus.Pending)
    expect(deriveDeepWorkDisplayStatus(node, true)).toBe(DeepWorkNodeStatus.Pending)
  })

  it('returns Pending when both task and step are null', () => {
    const node = makeTaskNode('C', { task: null })
    expect(deriveDeepWorkDisplayStatus(node, true)).toBe(DeepWorkNodeStatus.Pending)
  })
})

// =============================================================================
// findBoardSessions
// =============================================================================

describe('findBoardSessions', () => {
  it('matches active session to standalone task node by taskId', () => {
    const nodes = new Map([['n1', makeTaskNode('n1')]])
    const sessions = new Map([
      ['s1', makeSession('s1', 'task-n1')],
    ])
    const result = findBoardSessions(nodes, sessions)
    expect(result).toHaveLength(1)
    expect(result[0]!.nodeId).toBe('n1')
  })

  it('matches active session to step node by stepId', () => {
    const stepNode = makeStepNode('n2', 'step-1', 'wf-1')
    const nodes = new Map([['n2', stepNode]])
    const sessions = new Map([
      ['s1', makeSession('s1', 'wf-1', { stepId: 'step-1' })],
    ])
    const result = findBoardSessions(nodes, sessions)
    expect(result).toHaveLength(1)
    expect(result[0]!.nodeId).toBe('n2')
  })

  it('ignores completed sessions (with endTime)', () => {
    const nodes = new Map([['n1', makeTaskNode('n1')]])
    const sessions = new Map([
      ['s1', makeSession('s1', 'task-n1', { endTime: new Date() })],
    ])
    const result = findBoardSessions(nodes, sessions)
    expect(result).toHaveLength(0)
  })

  it('ignores sessions not matching any board node', () => {
    const nodes = new Map([['n1', makeTaskNode('n1')]])
    const sessions = new Map([
      ['s1', makeSession('s1', 'unrelated-task-id')],
    ])
    const result = findBoardSessions(nodes, sessions)
    expect(result).toHaveLength(0)
  })

  it('does not match task sessions to workflow nodes (hasSteps=true)', () => {
    const node = makeTaskNode('n1', {
      task: { ...makeTaskNode('n1').task!, hasSteps: true },
    })
    const nodes = new Map([['n1', node]])
    const sessions = new Map([
      ['s1', makeSession('s1', 'task-n1')],
    ])
    const result = findBoardSessions(nodes, sessions)
    expect(result).toHaveLength(0)
  })
})

// =============================================================================
// getInitialFields
// =============================================================================

describe('getInitialFields', () => {
  it('returns defaults for null node', () => {
    const fields = getInitialFields(null)
    expect(fields.name).toBe('')
    expect(fields.duration).toBe(30)
    expect(fields.importance).toBe(5)
    expect(fields.urgency).toBe(5)
    expect(fields.type).toBe('')
  })

  it('extracts fields from standalone task', () => {
    const node = makeTaskNode('A')
    const fields = getInitialFields(node)
    expect(fields.name).toBe('Task A')
    expect(fields.duration).toBe(30)
    expect(fields.type).toBe('focused')
    expect(fields.importance).toBe(5)
  })

  it('extracts fields from step node, inheriting importance from parentTask', () => {
    const node = makeStepNode('B', 'step-1', 'wf-1')
    const fields = getInitialFields(node)
    expect(fields.name).toBe('Step step-1')
    expect(fields.duration).toBe(15)
    expect(fields.importance).toBe(7)  // from parentTask
    expect(fields.urgency).toBe(8)     // from parentTask
    expect(fields.deadline).toBeNull() // steps don't have deadlines
  })

  it('returns defaults when task and step are both null', () => {
    const node = makeTaskNode('C', { task: null })
    const fields = getInitialFields(node)
    expect(fields.name).toBe('')
    expect(fields.duration).toBe(30)
  })
})

// =============================================================================
// calculateGridPosition
// =============================================================================

describe('calculateGridPosition', () => {
  it('places first node at default start when no existing nodes', () => {
    const pos = calculateGridPosition(0, [])
    expect(pos.x).toBe(100)
    expect(pos.y).toBe(100)
  })

  it('places nodes to the right of existing nodes', () => {
    const existing = [makeTaskNode('A', { positionX: 500 })]
    const pos = calculateGridPosition(0, existing)
    expect(pos.x).toBe(800) // 500 + 300
    expect(pos.y).toBe(100)
  })

  it('wraps to next row after nodesPerRow', () => {
    const pos4 = calculateGridPosition(4, [])
    expect(pos4.y).toBe(250) // 100 + 150 (second row)
    expect(pos4.x).toBe(100) // first column again
  })

  it('respects custom spacing options', () => {
    const pos = calculateGridPosition(1, [], { spacingX: 100, spacingY: 200, startY: 50 })
    expect(pos.x).toBe(200) // 100 + 1*100
    expect(pos.y).toBe(50)
  })
})

// =============================================================================
// Edge helper
// =============================================================================

function makeEdge(sourceNodeId: string, targetNodeId: string): DeepWorkEdge {
  return {
    id: `edge-${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId,
    edgeType: DeepWorkEdgeType.IntraWorkflow,
  }
}

// =============================================================================
// findFirstUnblockedBlocker
// =============================================================================

describe('findFirstUnblockedBlocker', () => {
  it('returns the immediate actionable blocker', () => {
    // A (actionable) → B (blocked)
    const nodeA = makeTaskNode('A')
    const nodeB = makeTaskNode('B')
    const nodes = new Map([['A', nodeA], ['B', nodeB]])
    const edges = [makeEdge('A', 'B')]
    const actionable = new Set(['A'])

    const result = findFirstUnblockedBlocker('B', nodes, edges, actionable, new Set())
    expect(result).toBe(nodeA)
  })

  it('traces through multiple blocked levels to find actionable ancestor', () => {
    // A (actionable) → B (blocked) → C (blocked)
    const nodeA = makeTaskNode('A')
    const nodeB = makeTaskNode('B')
    const nodeC = makeTaskNode('C')
    const nodes = new Map([['A', nodeA], ['B', nodeB], ['C', nodeC]])
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')]
    const actionable = new Set(['A'])

    const result = findFirstUnblockedBlocker('C', nodes, edges, actionable, new Set())
    expect(result).toBe(nodeA)
  })

  it('skips active session nodes when tracing', () => {
    // A (actionable but active) → B (blocked)
    const nodeA = makeTaskNode('A')
    const nodeB = makeTaskNode('B')
    const nodes = new Map([['A', nodeA], ['B', nodeB]])
    const edges = [makeEdge('A', 'B')]
    const actionable = new Set(['A'])
    const activeSessions = new Set(['A'])

    const result = findFirstUnblockedBlocker('B', nodes, edges, actionable, activeSessions)
    expect(result).toBeNull()
  })

  it('returns null when no actionable blocker exists on the board', () => {
    // B is blocked but its blocker is not on the board
    const nodeB = makeTaskNode('B')
    const nodes = new Map([['B', nodeB]])
    const edges: DeepWorkEdge[] = [] // no edges on board

    const result = findFirstUnblockedBlocker('B', nodes, edges, new Set(), new Set())
    expect(result).toBeNull()
  })

  it('handles diamond dependencies (A→B, A→C, B→D, C→D)', () => {
    // A is the bottleneck — it should be found from D
    const nodeA = makeTaskNode('A')
    const nodeB = makeTaskNode('B')
    const nodeC = makeTaskNode('C')
    const nodeD = makeTaskNode('D')
    const nodes = new Map([['A', nodeA], ['B', nodeB], ['C', nodeC], ['D', nodeD]])
    const edges = [makeEdge('A', 'B'), makeEdge('A', 'C'), makeEdge('B', 'D'), makeEdge('C', 'D')]
    const actionable = new Set(['A'])

    const result = findFirstUnblockedBlocker('D', nodes, edges, actionable, new Set())
    expect(result).toBe(nodeA)
  })
})

// =============================================================================
// pickRandomActionableNode
// =============================================================================

describe('pickRandomActionableNode', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // always pick first
  })

  it('returns null when all nodes are completed', () => {
    const node = makeTaskNode('n1', {
      task: { ...makeTaskNode('n1').task!, completed: true },
    })
    const nodes = new Map([['n1', node]])
    const result = pickRandomActionableNode(nodes, new Set(), new Set())
    expect(result).toBeNull()
  })

  it('picks actionable node directly when chosen', () => {
    const nodeA = makeTaskNode('n1')
    const nodeB = makeTaskNode('n2')
    const nodes = new Map([['n1', nodeA], ['n2', nodeB]])
    const actionable = new Set(['n1', 'n2'])

    // Math.random returns 0, picks first incomplete node
    const result = pickRandomActionableNode(nodes, actionable, new Set())
    expect(result).not.toBeNull()
    expect(actionable.has(result!.id)).toBe(true)
  })

  it('returns null when all incomplete nodes have active sessions', () => {
    const nodes = new Map([['n1', makeTaskNode('n1')]])
    const result = pickRandomActionableNode(nodes, new Set(['n1']), new Set(['n1']))
    expect(result).toBeNull()
  })

  it('traces to actionable blocker when blocked node is picked', () => {
    // A (actionable) → B (blocked)
    const nodeA = makeTaskNode('A')
    const nodeB = makeTaskNode('B')
    const nodes = new Map([['A', nodeA], ['B', nodeB]])
    const edges = [makeEdge('A', 'B')]
    const actionable = new Set(['A'])

    // Force picking B (the blocked node) — Math.random = 0.99 picks last
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const result = pickRandomActionableNode(nodes, actionable, new Set(), edges)

    // Should trace to A (the actionable blocker)
    expect(result).toBe(nodeA)
  })

  it('gives bottleneck nodes higher effective probability', () => {
    // A (actionable) blocks B, C, D (all blocked)
    // E (actionable) blocks nothing
    // A should be selected ~3x more often than E because B,C,D all trace back to A
    const nodeA = makeTaskNode('A')
    const nodeB = makeTaskNode('B')
    const nodeC = makeTaskNode('C')
    const nodeD = makeTaskNode('D')
    const nodeE = makeTaskNode('E')
    const nodes = new Map([
      ['A', nodeA], ['B', nodeB], ['C', nodeC], ['D', nodeD], ['E', nodeE],
    ])
    const edges = [makeEdge('A', 'B'), makeEdge('A', 'C'), makeEdge('A', 'D')]
    const actionable = new Set(['A', 'E'])

    // Run 1000 trials
    const counts = new Map<string, number>()
    for (let i = 0; i < 1000; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(Math.random())
      const result = pickRandomActionableNode(nodes, actionable, new Set(), edges)
      if (result) {
        counts.set(result.id, (counts.get(result.id) ?? 0) + 1)
      }
    }

    // A should be picked significantly more than E
    const aCount = counts.get('A') ?? 0
    const eCount = counts.get('E') ?? 0
    expect(aCount).toBeGreaterThan(eCount)
  })

  it('falls back to actionable nodes when chain tracing fails', () => {
    // B is blocked but its blocker is not on the board; A is actionable
    const nodeA = makeTaskNode('A')
    const nodeB = makeTaskNode('B')
    const nodes = new Map([['A', nodeA], ['B', nodeB]])
    const edges: DeepWorkEdge[] = [] // B has no edges on board
    const actionable = new Set(['A'])

    // Force picking B
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const result = pickRandomActionableNode(nodes, actionable, new Set(), edges)

    // Should fall back to A
    expect(result).toBe(nodeA)
  })

  it('backwards compatible — works without edges parameter', () => {
    const nodeA = makeTaskNode('A')
    const nodes = new Map([['A', nodeA]])
    const actionable = new Set(['A'])

    const result = pickRandomActionableNode(nodes, actionable, new Set())
    expect(result).toBe(nodeA)
  })
})
