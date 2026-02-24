import { describe, it, expect } from 'vitest'
import {
  determineMorphStrategy,
  buildConnectMorphResult,
  buildDisconnectMorphResult,
  classifyEdgeType,
  recalculateWorkflowMetrics,
} from '../deep-work-morph'
import { MorphStrategy, DeepWorkEdgeType } from '../deep-work-board-types'
import type { DeepWorkNodeWithData, DeepWorkEdge } from '../deep-work-board-types'
import { StepStatus, TaskStatus } from '../enums'

// =============================================================================
// Test Helpers
// =============================================================================

function makeTaskNode(
  id: string,
  taskOverrides: Record<string, unknown> = {},
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
      overallStatus: TaskStatus.NotStarted,
      criticalPathDuration: 0,
      worstCaseDuration: 0,
      archived: false,
      inActiveSprint: false,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      ...taskOverrides,
    },
    step: null,
    parentTask: null,
  }
}

function makeStepNode(
  nodeId: string,
  stepId: string,
  parentTaskId: string,
  dependsOn: string[] = [],
): DeepWorkNodeWithData {
  return {
    id: nodeId,
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
      taskId: parentTaskId,
      dependsOn,
      asyncWaitTime: 0,
      status: StepStatus.Pending,
      stepIndex: 0,
      percentComplete: 0,
      isAsyncTrigger: false,
    },
    parentTask: {
      id: parentTaskId,
      name: `Workflow ${parentTaskId}`,
      duration: 60,
      importance: 7,
      urgency: 6,
      type: 'focused',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      hasSteps: true,
      overallStatus: TaskStatus.InProgress,
      criticalPathDuration: 60,
      worstCaseDuration: 60,
      archived: false,
      inActiveSprint: true,
      sessionId: 'session-1',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      steps: [],
    },
  }
}

function makeEdge(
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: DeepWorkEdgeType = DeepWorkEdgeType.IntraWorkflow,
): DeepWorkEdge {
  return {
    id: `edge-${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId,
    edgeType,
  }
}

// =============================================================================
// Tests: determineMorphStrategy
// =============================================================================

describe('determineMorphStrategy', () => {
  it('should return CreateWorkflow for two standalone tasks', () => {
    const source = makeTaskNode('A')
    const target = makeTaskNode('B')

    expect(determineMorphStrategy(source, target)).toBe(MorphStrategy.CreateWorkflow)
  })

  it('should return JoinWorkflow when task connects to existing step', () => {
    const task = makeTaskNode('A')
    const step = makeStepNode('B', 'step-b', 'wf-1')

    expect(determineMorphStrategy(task, step)).toBe(MorphStrategy.JoinWorkflow)
    expect(determineMorphStrategy(step, task)).toBe(MorphStrategy.JoinWorkflow)
  })

  it('should return IntraWorkflow for two steps in the same workflow', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-1')

    expect(determineMorphStrategy(stepA, stepB)).toBe(MorphStrategy.IntraWorkflow)
  })

  it('should return CrossWorkflow for steps in different workflows', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-2')

    expect(determineMorphStrategy(stepA, stepB)).toBe(MorphStrategy.CrossWorkflow)
  })
})

// =============================================================================
// Tests: buildConnectMorphResult — CreateWorkflow
// =============================================================================

describe('buildConnectMorphResult — CreateWorkflow', () => {
  it('should create a new workflow with both tasks as steps', () => {
    const source = makeTaskNode('A', { importance: 8, urgency: 3 })
    const target = makeTaskNode('B', { importance: 5, urgency: 7 })

    const result = buildConnectMorphResult(source, target, [])

    expect(result.strategy).toBe(MorphStrategy.CreateWorkflow)
    expect(result.newWorkflowTask).not.toBeNull()
    expect(result.newWorkflowTask!.hasSteps).toBe(true)
    // Importance and urgency should be the max of both
    expect(result.newWorkflowTask!.importance).toBe(8)
    expect(result.newWorkflowTask!.urgency).toBe(7)
  })

  it('should create two step entries — source first, target depends on source', () => {
    const source = makeTaskNode('A')
    const target = makeTaskNode('B')

    const result = buildConnectMorphResult(source, target, [])

    expect(result.stepCreations).toHaveLength(2)
    const [sourceStep, targetStep] = result.stepCreations

    // Source step has no dependencies
    expect(sourceStep!.dependsOn).toEqual([])
    expect(sourceStep!.stepIndex).toBe(0)

    // Target step depends on source step
    expect(targetStep!.dependsOn).toEqual([sourceStep!.id])
    expect(targetStep!.stepIndex).toBe(1)
  })

  it('should archive both original tasks', () => {
    const source = makeTaskNode('A')
    const target = makeTaskNode('B')

    const result = buildConnectMorphResult(source, target, [])

    expect(result.taskArchiveIds).toHaveLength(2)
    expect(result.taskArchiveIds).toContain('task-A')
    expect(result.taskArchiveIds).toContain('task-B')
  })

  it('should update node identities from taskId to stepId', () => {
    const source = makeTaskNode('A')
    const target = makeTaskNode('B')

    const result = buildConnectMorphResult(source, target, [])

    expect(result.nodeIdentityUpdates).toHaveLength(2)
    for (const update of result.nodeIdentityUpdates) {
      expect(update.taskId).toBeNull()
      expect(update.stepId).toBeTruthy()
    }
  })

  it('should include WorkSession reassignments', () => {
    const source = makeTaskNode('A')
    const target = makeTaskNode('B')

    const result = buildConnectMorphResult(source, target, [])

    expect(result.workSessionUpdates).toHaveLength(2)
    expect(result.workSessionUpdates[0]!.originalTaskId).toBe('task-A')
    expect(result.workSessionUpdates[1]!.originalTaskId).toBe('task-B')
  })

  it('should propagate task data into step creation accurately', () => {
    const source = makeTaskNode('A', {
      name: 'Research',
      duration: 45,
      type: 'creative',
      cognitiveComplexity: 4,
      notes: 'Important stuff',
      asyncWaitTime: 10,
    })
    const target = makeTaskNode('B')

    const result = buildConnectMorphResult(source, target, [])

    const sourceStep = result.stepCreations[0]!
    expect(sourceStep.name).toBe('Research')
    expect(sourceStep.duration).toBe(45)
    expect(sourceStep.type).toBe('creative')
    expect(sourceStep.cognitiveComplexity).toBe(4)
    expect(sourceStep.notes).toBe('Important stuff')
    expect(sourceStep.asyncWaitTime).toBe(10)
  })
})

// =============================================================================
// Tests: buildConnectMorphResult — JoinWorkflow
// =============================================================================

describe('buildConnectMorphResult — JoinWorkflow', () => {
  it('should create one new step when task joins a workflow', () => {
    const task = makeTaskNode('A')
    const step = makeStepNode('B', 'step-b', 'wf-1')

    const result = buildConnectMorphResult(task, step, [])

    expect(result.strategy).toBe(MorphStrategy.JoinWorkflow)
    expect(result.stepCreations).toHaveLength(1)
    expect(result.newWorkflowTask).toBeNull() // Workflow already exists
    expect(result.taskArchiveIds).toContain('task-A')
  })

  it('should set correct dependency when task is the target (dependent)', () => {
    // step-b (source, completes first) → task-A (target, depends on step-b)
    const step = makeStepNode('B', 'step-b', 'wf-1')
    const task = makeTaskNode('A')

    const result = buildConnectMorphResult(step, task, [])

    const newStep = result.stepCreations[0]!
    expect(newStep.dependsOn).toContain('step-b')
    expect(result.stepUpdates).toHaveLength(0) // No updates to existing steps
  })

  it('should update existing step deps when task is the source (dependency)', () => {
    // task-A (source, completes first) → step-b (target, depends on new step)
    const task = makeTaskNode('A')
    const step = makeStepNode('B', 'step-b', 'wf-1')

    const result = buildConnectMorphResult(task, step, [])

    // The new step from task-A has no deps
    const newStep = result.stepCreations[0]!
    expect(newStep.dependsOn).toEqual([])

    // The existing step-b should be updated to depend on the new step
    expect(result.stepUpdates).toHaveLength(1)
    expect(result.stepUpdates[0]!.id).toBe('step-b')
    expect(result.stepUpdates[0]!.dependsOn).toContain(newStep.id)
  })
})

// =============================================================================
// Tests: buildConnectMorphResult — IntraWorkflow
// =============================================================================

describe('buildConnectMorphResult — IntraWorkflow', () => {
  it('should just add a dependsOn entry', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-1')

    const result = buildConnectMorphResult(stepA, stepB, [])

    expect(result.strategy).toBe(MorphStrategy.IntraWorkflow)
    expect(result.stepCreations).toHaveLength(0)
    expect(result.newWorkflowTask).toBeNull()
    expect(result.taskArchiveIds).toHaveLength(0)
    expect(result.nodeIdentityUpdates).toHaveLength(0)

    // Only change: target step gets source added to dependsOn
    expect(result.stepUpdates).toHaveLength(1)
    expect(result.stepUpdates[0]!.id).toBe('step-b')
    expect(result.stepUpdates[0]!.dependsOn).toContain('step-a')
  })
})

// =============================================================================
// Tests: buildConnectMorphResult — CrossWorkflow
// =============================================================================

describe('buildConnectMorphResult — CrossWorkflow', () => {
  it('should create a cross-workflow dependency', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-2')

    const result = buildConnectMorphResult(stepA, stepB, [])

    expect(result.strategy).toBe(MorphStrategy.CrossWorkflow)
    expect(result.crossWorkflowDependency).not.toBeNull()
    expect(result.crossWorkflowDependency!.blockedStepId).toBe('step-b')
    expect(result.crossWorkflowDependency!.blockingStepId).toBe('step-a')
    expect(result.crossWorkflowDependency!.isHardBlock).toBe(true)
  })
})

// =============================================================================
// Tests: buildDisconnectMorphResult
// =============================================================================

describe('buildDisconnectMorphResult', () => {
  it('should revert isolated node to task when removing its only edge', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-1', ['step-a'])
    const stepC = makeStepNode('C', 'step-c', 'wf-1', ['step-b'])

    const allEdges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
      makeEdge('B', 'C'),
    ]
    const removedEdge = allEdges[0]!

    const nodeMap = new Map<string, DeepWorkNodeWithData>()
    nodeMap.set('A', stepA)
    nodeMap.set('B', stepB)
    nodeMap.set('C', stepC)

    const result = buildDisconnectMorphResult(stepA, stepB, allEdges, nodeMap, removedEdge)

    // A has no remaining edges after removing A→B, so it should revert to task
    // B still has B→C, so B stays as a step
    const revertedNodeIds = result.nodeIdentityUpdates.map((u) => u.nodeId)
    expect(revertedNodeIds).toContain('A')
    // A's identity should switch from stepId to taskId
    const aUpdate = result.nodeIdentityUpdates.find((u) => u.nodeId === 'A')
    expect(aUpdate?.stepId).toBeNull()
    expect(aUpdate?.taskId).toBeTruthy()
  })

  it('should just remove dependsOn when both nodes retain other connections', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-1', ['step-a'])
    const stepC = makeStepNode('C', 'step-c', 'wf-1')

    // A→B and A→C — removing A→B leaves A still connected via A→C
    const allEdges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
    ]
    const removedEdge = allEdges[0]!

    const nodeMap = new Map<string, DeepWorkNodeWithData>()
    nodeMap.set('A', stepA)
    nodeMap.set('B', stepB)
    nodeMap.set('C', stepC)

    const result = buildDisconnectMorphResult(stepA, stepB, allEdges, nodeMap, removedEdge)

    // B becomes isolated (no remaining edges), but A still has A→C
    // So B should revert, but A should not
    // However, if B reverts and is the only step leaving wf-1 with just A and C,
    // the workflow still has 2 steps, so no cascade revert
    expect(result.nodeIdentityUpdates.some((u) => u.nodeId === 'A')).toBe(false)
  })

  it('should handle cross-workflow edge removal', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-2')

    // Give each node other connections so they don't become isolated
    const stepC = makeStepNode('C', 'step-c', 'wf-1')
    const stepD = makeStepNode('D', 'step-d', 'wf-2')

    const allEdges: DeepWorkEdge[] = [
      makeEdge('A', 'B', DeepWorkEdgeType.CrossWorkflow),
      makeEdge('A', 'C', DeepWorkEdgeType.IntraWorkflow),
      makeEdge('D', 'B', DeepWorkEdgeType.IntraWorkflow),
    ]
    const removedEdge = allEdges[0]!

    const nodeMap = new Map<string, DeepWorkNodeWithData>()
    nodeMap.set('A', stepA)
    nodeMap.set('B', stepB)
    nodeMap.set('C', stepC)
    nodeMap.set('D', stepD)

    const result = buildDisconnectMorphResult(stepA, stepB, allEdges, nodeMap, removedEdge)

    // Neither node is isolated (A has A→C, B has D→B)
    // Should be a simple cross-workflow dependency removal
    expect(result.strategy).toBe(MorphStrategy.CrossWorkflow)
    expect(result.nodeIdentityUpdates).toHaveLength(0)
  })

  it('should revert both nodes when removing the only edge between two steps', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-1', ['step-a'])

    const allEdges: DeepWorkEdge[] = [
      makeEdge('A', 'B'),
    ]
    const removedEdge = allEdges[0]!

    const nodeMap = new Map<string, DeepWorkNodeWithData>()
    nodeMap.set('A', stepA)
    nodeMap.set('B', stepB)

    const result = buildDisconnectMorphResult(stepA, stepB, allEdges, nodeMap, removedEdge)

    // Both A and B become isolated — both should revert to tasks
    // Also, the parent workflow has 0 steps remaining → should be archived
    expect(result.nodeIdentityUpdates).toHaveLength(2)
    expect(result.taskArchiveIds).toContain('wf-1')
  })

  it('should not revert task nodes (only step nodes can revert)', () => {
    const taskA = makeTaskNode('A')
    const taskB = makeTaskNode('B')

    const allEdges: DeepWorkEdge[] = [
      makeEdge('A', 'B', DeepWorkEdgeType.CrossWorkflow),
    ]
    const removedEdge = allEdges[0]!

    const nodeMap = new Map<string, DeepWorkNodeWithData>()
    nodeMap.set('A', taskA)
    nodeMap.set('B', taskB)

    const result = buildDisconnectMorphResult(taskA, taskB, allEdges, nodeMap, removedEdge)

    // Task nodes can't revert (they're already tasks), so no identity updates
    expect(result.nodeIdentityUpdates).toHaveLength(0)
  })
})

// =============================================================================
// Tests: classifyEdgeType
// =============================================================================

describe('classifyEdgeType', () => {
  it('should classify same-workflow steps as IntraWorkflow', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-1')

    expect(classifyEdgeType(stepA, stepB)).toBe(DeepWorkEdgeType.IntraWorkflow)
  })

  it('should classify different-workflow steps as CrossWorkflow', () => {
    const stepA = makeStepNode('A', 'step-a', 'wf-1')
    const stepB = makeStepNode('B', 'step-b', 'wf-2')

    expect(classifyEdgeType(stepA, stepB)).toBe(DeepWorkEdgeType.CrossWorkflow)
  })

  it('should classify task nodes as CrossWorkflow (different parent IDs)', () => {
    const taskA = makeTaskNode('A')
    const taskB = makeTaskNode('B')

    expect(classifyEdgeType(taskA, taskB)).toBe(DeepWorkEdgeType.CrossWorkflow)
  })
})

// =============================================================================
// Tests: recalculateWorkflowMetrics
// =============================================================================

describe('recalculateWorkflowMetrics', () => {
  it('should calculate total duration as sum of all steps', () => {
    const steps = [
      { id: 'a', duration: 30, dependsOn: [] },
      { id: 'b', duration: 45, dependsOn: [] },
    ]

    const metrics = recalculateWorkflowMetrics(steps)
    expect(metrics.totalDuration).toBe(75)
  })

  it('should calculate critical path for linear chain', () => {
    const steps = [
      { id: 'a', duration: 30, dependsOn: [] },
      { id: 'b', duration: 45, dependsOn: ['a'] },
    ]

    const metrics = recalculateWorkflowMetrics(steps)
    // Critical path: a(30) → b(45) = 75
    expect(metrics.criticalPathDuration).toBe(75)
  })

  it('should calculate critical path for parallel branches', () => {
    const steps = [
      { id: 'a', duration: 10, dependsOn: [] },
      { id: 'b', duration: 30, dependsOn: ['a'] },
      { id: 'c', duration: 20, dependsOn: ['a'] },
      { id: 'd', duration: 5, dependsOn: ['b', 'c'] },
    ]

    const metrics = recalculateWorkflowMetrics(steps)
    // Total: 10 + 30 + 20 + 5 = 65
    expect(metrics.totalDuration).toBe(65)
    // Critical path: a(10) → b(30) → d(5) = 45 (longer than a→c→d = 35)
    expect(metrics.criticalPathDuration).toBe(45)
  })

  it('should return 0 for empty steps', () => {
    const metrics = recalculateWorkflowMetrics([])
    expect(metrics.totalDuration).toBe(0)
    expect(metrics.criticalPathDuration).toBe(0)
  })
})
