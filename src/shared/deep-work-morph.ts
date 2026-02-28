/**
 * Deep Work Board — Task↔Step Morphing Logic
 *
 * Determines what structural changes are needed when nodes are connected
 * or disconnected on the canvas. Produces a declarative MorphResult that
 * the server executes atomically in a Prisma $transaction.
 *
 * Morph Strategies:
 * - CreateWorkflow: Two orphan Tasks → new workflow, both become Steps
 * - JoinWorkflow:   Orphan Task joins an existing workflow as a Step
 * - IntraWorkflow:  Both already Steps in the same workflow → add dependsOn
 * - CrossWorkflow:  Steps in different workflows → create cross-workflow dep
 *
 * Reverse (disconnect):
 * - Isolated Step → reverts to standalone Task
 * - Workflow with ≤1 step after removal → last step also reverts
 */

import type { DeepWorkNodeWithData, MorphResult } from './deep-work-board-types'
import { MorphStrategy, DeepWorkEdgeType } from './deep-work-board-types'
import type { DeepWorkEdge } from './deep-work-board-types'
import { TaskStatus } from './enums'
import { generateUniqueId } from './step-id-utils'
import { getCurrentTime } from './time-provider'
import { calculateCriticalPath } from './graph-utils'

// =============================================================================
// Strategy Determination
// =============================================================================

/**
 * Determine the morph strategy for connecting two nodes.
 *
 * Decision tree:
 * - Both have taskId (standalone) → CreateWorkflow
 * - One has taskId, other has stepId → JoinWorkflow
 * - Both have stepId, same parent → IntraWorkflow
 * - Both have stepId, different parent → CrossWorkflow
 */
export function determineMorphStrategy(
  sourceNode: DeepWorkNodeWithData,
  targetNode: DeepWorkNodeWithData,
): MorphStrategy {
  const sourceIsTask = sourceNode.taskId !== null && !sourceNode.task?.hasSteps
  const targetIsTask = targetNode.taskId !== null && !targetNode.task?.hasSteps
  const sourceIsStep = sourceNode.stepId !== null
  const targetIsStep = targetNode.stepId !== null

  if (sourceIsTask && targetIsTask) {
    return MorphStrategy.CreateWorkflow
  }

  if ((sourceIsTask && targetIsStep) || (sourceIsStep && targetIsTask)) {
    return MorphStrategy.JoinWorkflow
  }

  if (sourceIsStep && targetIsStep) {
    const sourceParentId = sourceNode.parentTask?.id
    const targetParentId = targetNode.parentTask?.id
    if (sourceParentId && targetParentId && sourceParentId === targetParentId) {
      return MorphStrategy.IntraWorkflow
    }
    return MorphStrategy.CrossWorkflow
  }

  // Fallback: shouldn't reach here if nodes are well-formed
  return MorphStrategy.IntraWorkflow
}

// =============================================================================
// Forward Morph (Connect)
// =============================================================================

/**
 * Build a MorphResult describing all mutations needed to connect two nodes.
 *
 * The result is a declarative plan — the caller (tRPC endpoint) executes it
 * in a Prisma $transaction for atomicity.
 *
 * @param sourceNode - The dependency node (completes first)
 * @param targetNode - The dependent node (blocked until source completes)
 * @param existingEdges - Current edges on the board (for step index calculation)
 */
export function buildConnectMorphResult(
  sourceNode: DeepWorkNodeWithData,
  targetNode: DeepWorkNodeWithData,
  existingEdges: DeepWorkEdge[],
): MorphResult {
  const strategy = determineMorphStrategy(sourceNode, targetNode)

  switch (strategy) {
    case MorphStrategy.CreateWorkflow:
      return buildCreateWorkflowMorph(sourceNode, targetNode)
    case MorphStrategy.JoinWorkflow:
      return buildJoinWorkflowMorph(sourceNode, targetNode, existingEdges)
    case MorphStrategy.IntraWorkflow:
      return buildIntraWorkflowMorph(sourceNode, targetNode)
    case MorphStrategy.CrossWorkflow:
      return buildCrossWorkflowMorph(sourceNode, targetNode)
  }
}

/**
 * Two standalone Tasks → create a new workflow containing both as Steps.
 */
function buildCreateWorkflowMorph(
  sourceNode: DeepWorkNodeWithData,
  targetNode: DeepWorkNodeWithData,
): MorphResult {
  const sourceTask = sourceNode.task
  const targetTask = targetNode.task
  if (!sourceTask || !targetTask) {
    return emptyMorphResult(MorphStrategy.CreateWorkflow)
  }

  const workflowId = generateUniqueId('task')
  const sourceStepId = generateUniqueId('step')
  const targetStepId = generateUniqueId('step')
  const now = getCurrentTime()

  // Derive workflow properties from the two tasks
  const workflowName = `${sourceTask.name} → ${targetTask.name}`
  const totalDuration = sourceTask.duration + targetTask.duration

  return {
    strategy: MorphStrategy.CreateWorkflow,

    newWorkflowTask: {
      id: workflowId,
      name: workflowName,
      duration: totalDuration,
      importance: Math.max(sourceTask.importance, targetTask.importance),
      urgency: Math.max(sourceTask.urgency, targetTask.urgency),
      type: sourceTask.type ?? targetTask.type ?? '',
      completed: false,
      hasSteps: true,
      overallStatus: TaskStatus.NotStarted,
      criticalPathDuration: totalDuration, // Linear chain: source → target
      worstCaseDuration: totalDuration,
      archived: false,
      inActiveSprint: sourceTask.inActiveSprint || targetTask.inActiveSprint,
      sessionId: sourceTask.sessionId,
      createdAt: now,
      updatedAt: now,
      dependencies: [],
      asyncWaitTime: 0,
    },

    stepCreations: [
      {
        id: sourceStepId,
        taskId: workflowId,
        name: sourceTask.name,
        duration: sourceTask.duration,
        type: sourceTask.type ?? '',
        dependsOn: [], // Source has no dependencies (it's first)
        stepIndex: 0,
        importance: sourceTask.importance,
        urgency: sourceTask.urgency,
        asyncWaitTime: sourceTask.asyncWaitTime,
        cognitiveComplexity: sourceTask.cognitiveComplexity ?? null,
        notes: sourceTask.notes ?? null,
      },
      {
        id: targetStepId,
        taskId: workflowId,
        name: targetTask.name,
        duration: targetTask.duration,
        type: targetTask.type ?? '',
        dependsOn: [sourceStepId], // Target depends on source
        stepIndex: 1,
        importance: targetTask.importance,
        urgency: targetTask.urgency,
        asyncWaitTime: targetTask.asyncWaitTime,
        cognitiveComplexity: targetTask.cognitiveComplexity ?? null,
        notes: targetTask.notes ?? null,
      },
    ],

    stepUpdates: [],
    taskArchiveIds: [sourceTask.id, targetTask.id],

    workSessionUpdates: [
      {
        originalTaskId: sourceTask.id,
        newTaskId: workflowId,
        newStepId: sourceStepId,
      },
      {
        originalTaskId: targetTask.id,
        newTaskId: workflowId,
        newStepId: targetStepId,
      },
    ],

    nodeIdentityUpdates: [
      { nodeId: sourceNode.id, taskId: null, stepId: sourceStepId },
      { nodeId: targetNode.id, taskId: null, stepId: targetStepId },
    ],

    crossWorkflowDependency: null,
  }
}

/**
 * One standalone Task joins an existing workflow as a new Step.
 */
function buildJoinWorkflowMorph(
  sourceNode: DeepWorkNodeWithData,
  targetNode: DeepWorkNodeWithData,
  _existingEdges: DeepWorkEdge[],
): MorphResult {
  // Determine which is the task and which is the step
  const sourceIsTask = sourceNode.taskId !== null && !sourceNode.task?.hasSteps
  const taskNode = sourceIsTask ? sourceNode : targetNode
  const stepNode = sourceIsTask ? targetNode : sourceNode
  const task = taskNode.task
  const step = stepNode.step
  const parentTask = stepNode.parentTask

  if (!task || !step || !parentTask) {
    return emptyMorphResult(MorphStrategy.JoinWorkflow)
  }

  const newStepId = generateUniqueId('step')
  const workflowId = parentTask.id

  // Calculate step index: find the max stepIndex in this workflow from existing edges/nodes
  const maxStepIndex = parentTask.steps
    ? Math.max(...parentTask.steps.map((s) => s.stepIndex), 0)
    : 0

  // Determine dependency direction
  // If the task node is the SOURCE (completes first), the existing step depends on... no.
  // sourceNode completes first, targetNode depends on it.
  // If taskNode is source: new step has no new deps from this edge, but the existing step gets a dep on the new step
  // If taskNode is target: new step depends on the existing step

  const dependsOn: string[] = []
  const stepUpdates: Array<{ id: string; dependsOn: string[] }> = []

  if (sourceIsTask) {
    // Task is source (completes first) → target step now depends on new step
    // Add newStepId to target step's dependsOn
    const existingDeps = step.dependsOn ?? []
    stepUpdates.push({
      id: step.id,
      dependsOn: [...existingDeps, newStepId],
    })
  } else {
    // Task is target (depends on source step) → new step depends on existing step
    dependsOn.push(step.id)
  }

  return {
    strategy: MorphStrategy.JoinWorkflow,

    newWorkflowTask: null, // Workflow already exists

    stepCreations: [
      {
        id: newStepId,
        taskId: workflowId,
        name: task.name,
        duration: task.duration,
        type: task.type ?? '',
        dependsOn,
        stepIndex: maxStepIndex + 1,
        importance: task.importance,
        urgency: task.urgency,
        asyncWaitTime: task.asyncWaitTime,
        cognitiveComplexity: task.cognitiveComplexity ?? null,
        notes: task.notes ?? null,
      },
    ],

    stepUpdates,
    taskArchiveIds: [task.id],

    workSessionUpdates: [
      {
        originalTaskId: task.id,
        newTaskId: workflowId,
        newStepId,
      },
    ],

    nodeIdentityUpdates: [
      { nodeId: taskNode.id, taskId: null, stepId: newStepId },
    ],

    crossWorkflowDependency: null,
  }
}

/**
 * Both nodes are Steps in the same workflow → just add a dependsOn entry.
 */
function buildIntraWorkflowMorph(
  sourceNode: DeepWorkNodeWithData,
  targetNode: DeepWorkNodeWithData,
): MorphResult {
  const targetStep = targetNode.step
  if (!targetStep) {
    return emptyMorphResult(MorphStrategy.IntraWorkflow)
  }

  const existingDeps = targetStep.dependsOn ?? []
  const sourceStepId = sourceNode.stepId

  if (!sourceStepId) {
    return emptyMorphResult(MorphStrategy.IntraWorkflow)
  }

  return {
    strategy: MorphStrategy.IntraWorkflow,
    newWorkflowTask: null,
    stepCreations: [],
    stepUpdates: [
      {
        id: targetStep.id,
        dependsOn: [...existingDeps, sourceStepId],
      },
    ],
    taskArchiveIds: [],
    workSessionUpdates: [],
    nodeIdentityUpdates: [],
    crossWorkflowDependency: null,
  }
}

/**
 * Steps in different workflows → create a cross-workflow EndeavorDependency.
 *
 * Note: Cross-workflow dependencies require both workflows to be in an Endeavor.
 * If they're not, this returns an empty morph (the UI should guide the user).
 */
function buildCrossWorkflowMorph(
  sourceNode: DeepWorkNodeWithData,
  targetNode: DeepWorkNodeWithData,
): MorphResult {
  const sourceStep = sourceNode.step
  const targetStep = targetNode.step
  const sourceParent = sourceNode.parentTask
  const targetParent = targetNode.parentTask

  if (!sourceStep || !targetStep || !sourceParent || !targetParent) {
    return emptyMorphResult(MorphStrategy.CrossWorkflow)
  }

  // For now, store as a step-level dependency update.
  // Full EndeavorDependency creation requires both workflows to be in endeavors,
  // which may not be the case on the Deep Work Board. We'll use a simpler approach:
  // add a cross-reference in the target step's dependsOn with a qualified ID.
  // The full EndeavorDependency path can be wired when endeavor integration is added.

  return {
    strategy: MorphStrategy.CrossWorkflow,
    newWorkflowTask: null,
    stepCreations: [],
    stepUpdates: [],
    taskArchiveIds: [],
    workSessionUpdates: [],
    nodeIdentityUpdates: [],
    crossWorkflowDependency: {
      endeavorId: '', // To be resolved by the server from the parent tasks' endeavor memberships
      blockedStepId: targetStep.id,
      blockingStepId: sourceStep.id,
      blockingTaskId: sourceParent.id,
      isHardBlock: true,
    },
  }
}

// =============================================================================
// Reverse Morph (Disconnect)
// =============================================================================

/**
 * Determine what happens when an edge is removed between two nodes.
 *
 * Returns a MorphResult describing how to undo any structural changes.
 * The key question: does removing this edge isolate any Step nodes?
 * If so, those Steps must revert to standalone Tasks.
 *
 * @param sourceNode - The source of the removed edge
 * @param targetNode - The target of the removed edge
 * @param allEdges - All current edges (INCLUDING the one being removed, for context)
 * @param allNodes - All current nodes on the board
 * @param removedEdge - The specific edge being removed
 */
export function buildDisconnectMorphResult(
  sourceNode: DeepWorkNodeWithData,
  targetNode: DeepWorkNodeWithData,
  allEdges: DeepWorkEdge[],
  allNodes: Map<string, DeepWorkNodeWithData>,
  removedEdge: DeepWorkEdge,
): MorphResult {
  // Remove the edge from consideration
  const remainingEdges = allEdges.filter((e) => e.id !== removedEdge.id)

  // Check if either node becomes isolated (no remaining edges)
  const nodesNeedingRevert: DeepWorkNodeWithData[] = []

  for (const node of [sourceNode, targetNode]) {
    if (!node.stepId) continue // Only step nodes can revert

    const hasRemainingEdges = remainingEdges.some(
      (e) => e.sourceNodeId === node.id || e.targetNodeId === node.id,
    )

    if (!hasRemainingEdges) {
      nodesNeedingRevert.push(node)
    }
  }

  // If both were intra-workflow and neither is isolated, just remove the dependsOn
  if (nodesNeedingRevert.length === 0) {
    return buildRemoveDependencyMorph(sourceNode, targetNode, removedEdge)
  }

  // Build revert plan for isolated nodes
  return buildRevertToTaskMorph(nodesNeedingRevert, remainingEdges, allNodes)
}

/**
 * Simply remove a dependsOn entry — no structural changes needed.
 */
function buildRemoveDependencyMorph(
  sourceNode: DeepWorkNodeWithData,
  targetNode: DeepWorkNodeWithData,
  removedEdge: DeepWorkEdge,
): MorphResult {
  const targetStep = targetNode.step

  if (removedEdge.edgeType === DeepWorkEdgeType.IntraWorkflow && targetStep) {
    const sourceStepId = sourceNode.stepId
    if (sourceStepId) {
      return {
        strategy: MorphStrategy.IntraWorkflow,
        newWorkflowTask: null,
        stepCreations: [],
        stepUpdates: [
          {
            id: targetStep.id,
            dependsOn: (targetStep.dependsOn ?? []).filter((id) => id !== sourceStepId),
          },
        ],
        taskArchiveIds: [],
        workSessionUpdates: [],
        nodeIdentityUpdates: [],
        crossWorkflowDependency: null,
      }
    }
  }

  // Cross-workflow: remove the endeavor dependency (handled by server)
  return emptyMorphResult(MorphStrategy.CrossWorkflow)
}

/**
 * Revert isolated Step nodes back to standalone Tasks.
 *
 * For each isolated step:
 * 1. Create a new standalone Task from the Step's data
 * 2. Reassign WorkSessions
 * 3. Remove the Step from its parent workflow
 * 4. If the parent workflow has ≤1 step remaining, also revert that last step
 */
function buildRevertToTaskMorph(
  isolatedNodes: DeepWorkNodeWithData[],
  _remainingEdges: DeepWorkEdge[],
  allNodes: Map<string, DeepWorkNodeWithData>,
): MorphResult {
  const result = emptyMorphResult(MorphStrategy.CreateWorkflow)

  // Track which parent workflows are affected so we can check for ≤1 step
  const affectedWorkflows = new Map<string, {
    parentTask: NonNullable<DeepWorkNodeWithData['parentTask']>
    remainingStepNodeIds: Set<string>
  }>()

  // First pass: identify all isolated nodes and their parent workflows
  for (const node of isolatedNodes) {
    if (!node.step || !node.parentTask) continue

    const workflowId = node.parentTask.id
    if (!affectedWorkflows.has(workflowId)) {
      // Find all nodes in this workflow that are NOT being reverted
      const workflowStepNodeIds = new Set<string>()
      for (const [nid, n] of allNodes) {
        if (n.parentTask?.id === workflowId && n.stepId) {
          workflowStepNodeIds.add(nid)
        }
      }
      affectedWorkflows.set(workflowId, {
        parentTask: node.parentTask,
        remainingStepNodeIds: workflowStepNodeIds,
      })
    }

    // Remove this node from the remaining set
    affectedWorkflows.get(workflowId)?.remainingStepNodeIds.delete(node.id)
  }

  // Check if any affected workflow would have ≤1 step remaining
  // If so, that last step also needs to revert
  const additionalRevertNodes: DeepWorkNodeWithData[] = []
  for (const [, workflow] of affectedWorkflows) {
    if (workflow.remainingStepNodeIds.size === 1) {
      const lastNodeId = Array.from(workflow.remainingStepNodeIds)[0]
      if (lastNodeId) {
        const lastNode = allNodes.get(lastNodeId)
        if (lastNode && lastNode.stepId) {
          additionalRevertNodes.push(lastNode)
          workflow.remainingStepNodeIds.delete(lastNodeId)
        }
      }
    }
  }

  const allNodesToRevert = [...isolatedNodes, ...additionalRevertNodes]

  // Build revert operations for each node
  for (const node of allNodesToRevert) {
    if (!node.step || !node.parentTask) continue

    const step = node.step
    const parentTaskId = node.parentTask.id
    const newTaskId = generateUniqueId('task')

    // The "new task" that replaces this step — but we express it as
    // metadata for the server to create (not a full Task object here).
    // We piggyback on stepCreations in reverse — the server interprets
    // nodeIdentityUpdates with a non-null taskId as "create task from step data"
    result.nodeIdentityUpdates.push({
      nodeId: node.id,
      taskId: newTaskId,
      stepId: null,
    })

    // WorkSession reassignment: from workflow → new standalone task
    result.workSessionUpdates.push({
      originalTaskId: parentTaskId,
      newTaskId: newTaskId,
      newStepId: step.id, // Server uses this to match the specific step's sessions
    })

    // Track the step that needs to be deleted (via stepUpdates with empty dependsOn as signal)
    // Actually, the server handles step deletion when processing nodeIdentityUpdates
    // that switch from stepId → taskId. We include the step data needed to create the new task.
    result.stepCreations.push({
      id: newTaskId, // The NEW task ID (overloaded: server knows this is a revert when strategy changes)
      taskId: parentTaskId, // Source workflow for reference
      name: step.name,
      duration: step.duration,
      type: step.type,
      dependsOn: [], // Standalone task — no step-level deps
      stepIndex: step.stepIndex,
      importance: step.importance ?? node.parentTask.importance,
      urgency: step.urgency ?? node.parentTask.urgency,
      asyncWaitTime: step.asyncWaitTime,
      cognitiveComplexity: step.cognitiveComplexity ?? null,
      notes: step.notes ?? null,
    })
  }

  // Archive parent workflows that have 0 steps remaining
  for (const [workflowId, workflow] of affectedWorkflows) {
    if (workflow.remainingStepNodeIds.size === 0) {
      result.taskArchiveIds.push(workflowId)
    }
  }

  return result
}

// =============================================================================
// Edge Type Classification
// =============================================================================

/**
 * Classify an edge between two nodes as intra-workflow or cross-workflow.
 */
export function classifyEdgeType(
  sourceNode: DeepWorkNodeWithData,
  targetNode: DeepWorkNodeWithData,
): DeepWorkEdgeType {
  const sourceParentId = sourceNode.parentTask?.id ?? sourceNode.taskId
  const targetParentId = targetNode.parentTask?.id ?? targetNode.taskId

  if (sourceParentId && targetParentId && sourceParentId === targetParentId) {
    return DeepWorkEdgeType.IntraWorkflow
  }
  return DeepWorkEdgeType.CrossWorkflow
}

// =============================================================================
// Workflow Metrics
// =============================================================================

/**
 * Recalculate a workflow's critical path duration after structural changes.
 * Uses the existing calculateCriticalPath from graph-utils.
 */
export function recalculateWorkflowMetrics(
  steps: Array<{ id: string; duration: number; dependsOn: string[] }>,
): { criticalPathDuration: number; totalDuration: number } {
  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0)

  const graphNodes = steps.map((s) => ({
    id: s.id,
    dependencies: s.dependsOn,
    duration: s.duration,
  }))

  const criticalPathDuration = calculateCriticalPath(graphNodes)

  return { criticalPathDuration, totalDuration }
}

// =============================================================================
// Helpers
// =============================================================================

/** Create an empty MorphResult for error/fallback cases. */
function emptyMorphResult(strategy: MorphStrategy): MorphResult {
  return {
    strategy,
    newWorkflowTask: null,
    stepCreations: [],
    stepUpdates: [],
    taskArchiveIds: [],
    workSessionUpdates: [],
    nodeIdentityUpdates: [],
    crossWorkflowDependency: null,
  }
}
