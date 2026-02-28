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
} from '../deep-work-node-utils'
import type { DeepWorkNodeWithData } from '../deep-work-board-types'
import { DeepWorkNodeStatus } from '../deep-work-board-types'
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
// pickRandomActionableNode
// =============================================================================

describe('pickRandomActionableNode', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // always pick first
  })

  it('returns null when no actionable nodes exist', () => {
    const nodes = new Map([['n1', makeTaskNode('n1')]])
    const result = pickRandomActionableNode(nodes, new Set(), new Set())
    expect(result).toBeNull()
  })

  it('picks from actionable nodes not in active sessions', () => {
    const nodeA = makeTaskNode('n1')
    const nodeB = makeTaskNode('n2')
    const nodes = new Map([['n1', nodeA], ['n2', nodeB]])
    const actionable = new Set(['n1', 'n2'])
    const activeSessions = new Set(['n1']) // n1 is already active

    const result = pickRandomActionableNode(nodes, actionable, activeSessions)
    expect(result).toBe(nodeB) // n2 is the only eligible candidate
  })

  it('returns null when all actionable nodes have active sessions', () => {
    const nodes = new Map([['n1', makeTaskNode('n1')]])
    const result = pickRandomActionableNode(nodes, new Set(['n1']), new Set(['n1']))
    expect(result).toBeNull()
  })

  it('picks randomly from multiple candidates', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // pick middle
    const nodes = new Map([
      ['n1', makeTaskNode('n1')],
      ['n2', makeTaskNode('n2')],
      ['n3', makeTaskNode('n3')],
    ])
    const actionable = new Set(['n1', 'n2', 'n3'])
    const result = pickRandomActionableNode(nodes, actionable, new Set())
    expect(result).not.toBeNull()
  })
})
