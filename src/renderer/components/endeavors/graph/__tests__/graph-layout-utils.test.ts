import { describe, it, expect, vi } from 'vitest'
import type { Node, Edge } from 'reactflow'
import { StepStatus, EndeavorStatus } from '@shared/enums'
import type { EndeavorWithTasks, TaskStep } from '@shared/types'
import type { UserTaskType } from '@shared/user-task-types'

// Mock logger before importing modules that use it
vi.mock('@/logger', () => ({
  logger: {
    ui: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    system: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}))

import {
  hexToRgba,
  calculateStepLevels,
  computeGraphLayout,
  injectNodeMetadata,
  mergeAndStyleEdges,
  computeCrossEndeavorEdges,
} from '../graph-layout-utils'

// --- Factories ---

function createMockStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: `step-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Step',
    duration: 30,
    type: 'type-dev',
    taskId: 'task-1',
    dependsOn: [],
    asyncWaitTime: 0,
    status: StepStatus.Pending,
    stepIndex: 0,
    percentComplete: 0,
    ...overrides,
  }
}

function createMockType(overrides: Partial<UserTaskType> = {}): UserTaskType {
  return {
    id: 'type-dev',
    sessionId: 'session-1',
    name: 'Development',
    emoji: '💻',
    color: '#4A90D9',
    sortOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function createMockEndeavor(overrides: Partial<EndeavorWithTasks> = {}): EndeavorWithTasks {
  return {
    id: 'endeavor-1',
    name: 'Test Endeavor',
    status: EndeavorStatus.Active,
    importance: 5,
    urgency: 5,
    color: '#165DFF',
    sessionId: 'session-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    items: [],
    ...overrides,
  }
}

function createWorkflowItem(
  taskId: string,
  steps: TaskStep[],
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `item-${taskId}`,
    endeavorId: 'endeavor-1',
    taskId,
    sortOrder: 0,
    addedAt: new Date('2024-01-01'),
    task: {
      id: taskId,
      name: `Workflow ${taskId}`,
      duration: steps.reduce((sum, s) => sum + s.duration, 0),
      importance: 5,
      urgency: 5,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      hasSteps: true,
      overallStatus: 'in_progress',
      criticalPathDuration: 0,
      worstCaseDuration: 0,
      steps,
      ...overrides,
    },
  }
}

function createSimpleItem(
  taskId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `item-${taskId}`,
    endeavorId: 'endeavor-1',
    taskId,
    sortOrder: 0,
    addedAt: new Date('2024-01-01'),
    task: {
      id: taskId,
      name: `Simple ${taskId}`,
      duration: 30,
      importance: 5,
      urgency: 5,
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      hasSteps: false,
      overallStatus: 'not_started',
      criticalPathDuration: 0,
      worstCaseDuration: 0,
      ...overrides,
    },
  }
}

const userTypes = [createMockType()]

// --- Tests ---

describe('hexToRgba', () => {
  it('should convert standard hex to rgba', () => {
    expect(hexToRgba('#FF5500', 0.5)).toBe('rgba(255, 85, 0, 0.5)')
  })

  it('should handle hex without hash prefix', () => {
    expect(hexToRgba('FF5500', 0.5)).toBe('rgba(255, 85, 0, 0.5)')
  })

  it('should handle white', () => {
    expect(hexToRgba('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)')
  })

  it('should handle black', () => {
    expect(hexToRgba('#000000', 0)).toBe('rgba(0, 0, 0, 0)')
  })

  it('should handle alpha of 0.4', () => {
    expect(hexToRgba('#165DFF', 0.4)).toBe('rgba(22, 93, 255, 0.4)')
  })
})

describe('calculateStepLevels', () => {
  it('should assign level 0 to steps with no dependencies', () => {
    const steps = [
      createMockStep({ id: 's1', dependsOn: [] }),
      createMockStep({ id: 's2', dependsOn: [] }),
    ]

    const levels = calculateStepLevels(steps)

    expect(levels.get('s1')).toBe(0)
    expect(levels.get('s2')).toBe(0)
  })

  it('should assign increasing levels for linear chains', () => {
    const steps = [
      createMockStep({ id: 's1', dependsOn: [] }),
      createMockStep({ id: 's2', dependsOn: ['s1'] }),
      createMockStep({ id: 's3', dependsOn: ['s2'] }),
    ]

    const levels = calculateStepLevels(steps)

    expect(levels.get('s1')).toBe(0)
    expect(levels.get('s2')).toBe(1)
    expect(levels.get('s3')).toBe(2)
  })

  it('should handle diamond dependencies', () => {
    // s1 → s2, s1 → s3, s2+s3 → s4
    const steps = [
      createMockStep({ id: 's1', dependsOn: [] }),
      createMockStep({ id: 's2', dependsOn: ['s1'] }),
      createMockStep({ id: 's3', dependsOn: ['s1'] }),
      createMockStep({ id: 's4', dependsOn: ['s2', 's3'] }),
    ]

    const levels = calculateStepLevels(steps)

    expect(levels.get('s1')).toBe(0)
    expect(levels.get('s2')).toBe(1)
    expect(levels.get('s3')).toBe(1)
    expect(levels.get('s4')).toBe(2)
  })

  it('should handle cycles without infinite recursion', () => {
    // s1 → s2 → s1 (cycle)
    const steps = [
      createMockStep({ id: 's1', dependsOn: ['s2'] }),
      createMockStep({ id: 's2', dependsOn: ['s1'] }),
    ]

    // Should not throw, cycle detection returns 0
    const levels = calculateStepLevels(steps)
    expect(levels.size).toBe(2)
  })

  it('should ignore dependencies on steps not in the array', () => {
    const steps = [
      createMockStep({ id: 's1', dependsOn: ['missing-step'] }),
    ]

    const levels = calculateStepLevels(steps)

    expect(levels.get('s1')).toBe(0)
  })

  it('should return empty map for empty steps array', () => {
    const levels = calculateStepLevels([])
    expect(levels.size).toBe(0)
  })
})

describe('computeGraphLayout', () => {
  it('should produce nodes and edges for a single endeavor with linear steps', () => {
    const steps = [
      createMockStep({ id: 's1', stepIndex: 0, taskId: 'task-1', dependsOn: [] }),
      createMockStep({ id: 's2', stepIndex: 1, taskId: 'task-1', dependsOn: ['s1'] }),
      createMockStep({ id: 's3', stepIndex: 2, taskId: 'task-1', dependsOn: ['s2'] }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowItem('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeGraphLayout([endeavor], userTypes)

    // Should have region node + 3 step nodes + 1 goal node = 5
    expect(result.nodes.length).toBe(5)
    // Region node
    const regionNode = result.nodes.find(n => n.id === 'endeavor-endeavor-1')
    expect(regionNode).toBeDefined()
    expect(regionNode!.type).toBe('endeavorRegion')
    // Step nodes
    expect(result.nodes.filter(n => n.type === 'taskStep')).toHaveLength(3)
    // Goal node
    expect(result.nodes.filter(n => n.type === 'goal')).toHaveLength(1)

    // Should have edges: s1→s2, s2→s3, plus terminal→goal edges
    const stepEdges = result.edges.filter(e => e.id.startsWith('edge-'))
    expect(stepEdges.length).toBeGreaterThanOrEqual(2) // s1→s2, s2→s3
  })

  it('should handle endeavor with parallel branches', () => {
    // s1 → s2 and s1 → s3 (parallel branches)
    const steps = [
      createMockStep({ id: 's1', stepIndex: 0, taskId: 'task-1', dependsOn: [] }),
      createMockStep({ id: 's2', stepIndex: 1, taskId: 'task-1', dependsOn: ['s1'] }),
      createMockStep({ id: 's3', stepIndex: 2, taskId: 'task-1', dependsOn: ['s1'] }),
    ]
    const endeavor = createMockEndeavor({
      items: [createWorkflowItem('task-1', steps)] as EndeavorWithTasks['items'],
    })

    const result = computeGraphLayout([endeavor], userTypes)

    // s2 and s3 should be at the same level (level 1)
    const s2Node = result.nodes.find(n => n.id === 'step-s2')
    const s3Node = result.nodes.find(n => n.id === 'step-s3')
    expect(s2Node).toBeDefined()
    expect(s3Node).toBeDefined()
    // Same x position (same level)
    expect(s2Node!.position.x).toBe(s3Node!.position.x)
    // Different y positions (different rows)
    expect(s2Node!.position.y).not.toBe(s3Node!.position.y)
  })

  it('should handle simple task as a single node', () => {
    const endeavor = createMockEndeavor({
      items: [createSimpleItem('task-simple')] as EndeavorWithTasks['items'],
    })

    const result = computeGraphLayout([endeavor], userTypes)

    // Region + simple task node + goal = 3
    expect(result.nodes.length).toBe(3)
    const taskNode = result.nodes.find(n => n.id === 'task-task-simple')
    expect(taskNode).toBeDefined()
    expect(taskNode!.type).toBe('taskStep')
    expect(taskNode!.data.isSimpleTask).toBe(true)
  })

  it('should arrange multiple endeavors in a grid with no overlapping', () => {
    const endeavor1 = createMockEndeavor({
      id: 'e1',
      items: [createWorkflowItem('task-1', [
        createMockStep({ id: 's1', stepIndex: 0, taskId: 'task-1' }),
      ])] as EndeavorWithTasks['items'],
    })
    const endeavor2 = createMockEndeavor({
      id: 'e2',
      items: [createWorkflowItem('task-2', [
        createMockStep({ id: 's2', stepIndex: 0, taskId: 'task-2' }),
      ])] as EndeavorWithTasks['items'],
    })

    const result = computeGraphLayout([endeavor1, endeavor2], userTypes)

    const r1 = result.nodes.find(n => n.id === 'endeavor-e1')
    const r2 = result.nodes.find(n => n.id === 'endeavor-e2')
    expect(r1).toBeDefined()
    expect(r2).toBeDefined()
    // Two regions should not have the same position
    const samePos = r1!.position.x === r2!.position.x && r1!.position.y === r2!.position.y
    expect(samePos).toBe(false)
  })

  it('should return empty nodes/edges for empty endeavors', () => {
    const result = computeGraphLayout([], userTypes)

    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })
})

describe('injectNodeMetadata', () => {
  it('should apply edit mode flag to taskStep nodes only', () => {
    const nodes: Node[] = [
      { id: 'step-s1', type: 'taskStep', position: { x: 0, y: 0 }, data: { label: 'Step 1' } },
      { id: 'endeavor-e1', type: 'endeavorRegion', position: { x: 0, y: 0 }, data: { label: 'Region' } },
    ]

    const result = injectNodeMetadata(nodes, {
      isEditMode: true,
      criticalNodeIds: new Set(),
      showCriticalPath: false,
      activeStepNodeId: null,
    })

    expect(result[0].data.isEditable).toBe(true)
    expect(result[1].data.isEditable).toBeUndefined()
  })

  it('should apply critical path flag to matching nodes', () => {
    const nodes: Node[] = [
      { id: 'step-s1', type: 'taskStep', position: { x: 0, y: 0 }, data: {} },
      { id: 'step-s2', type: 'taskStep', position: { x: 0, y: 0 }, data: {} },
    ]

    const result = injectNodeMetadata(nodes, {
      isEditMode: false,
      criticalNodeIds: new Set(['step-s1']),
      showCriticalPath: true,
      activeStepNodeId: null,
    })

    expect(result[0].data.isOnCriticalPath).toBe(true)
    expect(result[1].data.isOnCriticalPath).toBe(false)
  })

  it('should apply active step flag to matching node', () => {
    const nodes: Node[] = [
      { id: 'step-s1', type: 'taskStep', position: { x: 0, y: 0 }, data: {} },
      { id: 'step-s2', type: 'taskStep', position: { x: 0, y: 0 }, data: {} },
    ]

    const result = injectNodeMetadata(nodes, {
      isEditMode: false,
      criticalNodeIds: new Set(),
      showCriticalPath: false,
      activeStepNodeId: 'step-s1',
    })

    expect(result[0].data.isActiveWork).toBe(true)
    expect(result[1].data.isActiveWork).toBe(false)
  })

  it('should apply critical path flag to goal nodes when showCriticalPath is true', () => {
    const nodes: Node[] = [
      { id: 'goal-e1', type: 'goal', position: { x: 0, y: 0 }, data: { label: 'Goal' } },
    ]

    const result = injectNodeMetadata(nodes, {
      isEditMode: false,
      criticalNodeIds: new Set(),
      showCriticalPath: true,
      activeStepNodeId: null,
    })

    expect(result[0].data.isOnCriticalPath).toBe(true)
  })

  it('should pass through non-taskStep/non-goal nodes unchanged', () => {
    const nodes: Node[] = [
      { id: 'endeavor-e1', type: 'endeavorRegion', position: { x: 0, y: 0 }, data: { label: 'Region' } },
    ]

    const result = injectNodeMetadata(nodes, {
      isEditMode: true,
      criticalNodeIds: new Set(),
      showCriticalPath: true,
      activeStepNodeId: 'step-s1',
    })

    expect(result[0]).toEqual(nodes[0])
  })
})

describe('mergeAndStyleEdges', () => {
  it('should merge layout and dependency edges', () => {
    const layoutEdges: Edge[] = [
      { id: 'edge-s1-s2', source: 'step-s1', target: 'step-s2' },
    ]
    const depEdges: Edge[] = [
      { id: 'dep-1', source: 'step-s3', target: 'step-s4' },
    ]

    const result = mergeAndStyleEdges(layoutEdges, depEdges, new Set())

    expect(result).toHaveLength(2)
    expect(result.map(e => e.id)).toEqual(['edge-s1-s2', 'dep-1'])
  })

  it('should apply golden stroke and animation to critical path edges', () => {
    const edges: Edge[] = [
      { id: 'edge-s1-s2', source: 'step-s1', target: 'step-s2', style: { stroke: '#86909c' } },
      { id: 'edge-s2-s3', source: 'step-s2', target: 'step-s3', style: { stroke: '#86909c' } },
    ]

    const result = mergeAndStyleEdges(edges, [], new Set(['edge-s1-s2']))

    expect(result[0].style!.stroke).toBe('#FAAD14')
    expect(result[0].style!.strokeWidth).toBe(3)
    expect(result[0].animated).toBe(true)
    // Non-critical edge unchanged
    expect(result[1].style!.stroke).toBe('#86909c')
    expect(result[1].animated).toBeUndefined()
  })

  it('should leave non-critical edges unchanged', () => {
    const edges: Edge[] = [
      { id: 'edge-s1-s2', source: 'step-s1', target: 'step-s2', animated: false },
    ]

    const result = mergeAndStyleEdges(edges, [], new Set())

    expect(result[0].animated).toBe(false)
  })
})

describe('computeCrossEndeavorEdges', () => {
  it('should create edge for cross-endeavor dependency', () => {
    const deps = new Map()
    deps.set('endeavor-1', [{
      id: 'dep-1',
      endeavorId: 'endeavor-1',
      blockedStepId: 's2',
      blockingStepId: 's1',
      blockingTaskId: 'task-1',
      isHardBlock: true,
      createdAt: new Date(),
      blockingStepName: 'Step 1',
      blockingTaskName: 'Task 1',
      blockingStepStatus: StepStatus.Pending,
    }])

    const edges = computeCrossEndeavorEdges(deps, false)

    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe('step-s1')
    expect(edges[0].target).toBe('step-s2')
    expect(edges[0].type).toBe('dependency')
  })

  it('should use different marker colors for hard vs soft blocks', () => {
    const deps = new Map()
    deps.set('endeavor-1', [
      {
        id: 'dep-hard',
        endeavorId: 'endeavor-1',
        blockedStepId: 's2',
        blockingStepId: 's1',
        blockingTaskId: 'task-1',
        isHardBlock: true,
        createdAt: new Date(),
        blockingStepName: 'Step 1',
        blockingTaskName: 'Task 1',
        blockingStepStatus: StepStatus.Pending,
      },
      {
        id: 'dep-soft',
        endeavorId: 'endeavor-1',
        blockedStepId: 's4',
        blockingStepId: 's3',
        blockingTaskId: 'task-2',
        isHardBlock: false,
        createdAt: new Date(),
        blockingStepName: 'Step 3',
        blockingTaskName: 'Task 2',
        blockingStepStatus: StepStatus.Pending,
      },
    ])

    const edges = computeCrossEndeavorEdges(deps, false)

    const hardEdge = edges.find(e => e.id === 'dep-dep-hard')!
    const softEdge = edges.find(e => e.id === 'dep-dep-soft')!

    expect((hardEdge.markerEnd as { color: string }).color).toBe('#F77234')
    expect((softEdge.markerEnd as { color: string }).color).toBe('#F7BA1E')
  })

  it('should skip dependencies without target node', () => {
    const deps = new Map()
    deps.set('endeavor-1', [{
      id: 'dep-1',
      endeavorId: 'endeavor-1',
      // No blockedStepId or blockedTaskId
      blockingStepId: 's1',
      blockingTaskId: 'task-1',
      isHardBlock: true,
      createdAt: new Date(),
      blockingStepName: 'Step 1',
      blockingTaskName: 'Task 1',
      blockingStepStatus: StepStatus.Pending,
    }])

    const edges = computeCrossEndeavorEdges(deps, false)

    expect(edges).toHaveLength(0)
  })

  it('should handle blockedTaskId for simple tasks', () => {
    const deps = new Map()
    deps.set('endeavor-1', [{
      id: 'dep-1',
      endeavorId: 'endeavor-1',
      blockedTaskId: 'task-simple',
      blockingStepId: 's1',
      blockingTaskId: 'task-1',
      isHardBlock: true,
      createdAt: new Date(),
      blockingStepName: 'Step 1',
      blockingTaskName: 'Task 1',
      blockingStepStatus: StepStatus.Pending,
    }])

    const edges = computeCrossEndeavorEdges(deps, false)

    expect(edges).toHaveLength(1)
    expect(edges[0].target).toBe('task-task-simple')
  })
})
