/**
 * Deep Work Node Utilities
 *
 * Shared pure functions for Deep Work Board node operations.
 * Extracted from TSX components to enable unit testing and reduce duplication.
 */

import { StepStatus } from './enums'
import { DeepWorkNodeStatus } from './deep-work-board-types'
import type { DeepWorkNodeWithData, DeepWorkEdge } from './deep-work-board-types'
import type { UnifiedWorkSession } from './unified-work-session-types'
import { getCurrentTime } from './time-provider'

// =============================================================================
// Node Data Accessors
// =============================================================================

/** Get display name from a node's underlying task or step */
export function getNodeName(node: DeepWorkNodeWithData): string {
  return node.task?.name ?? node.step?.name ?? 'Untitled'
}

/** Get planned duration (minutes) from a node's underlying task or step */
export function getNodeDuration(node: DeepWorkNodeWithData): number {
  return node.task?.duration ?? node.step?.duration ?? 0
}

/** Get type ID from a node's underlying task or step */
export function getNodeTypeId(node: DeepWorkNodeWithData): string {
  return node.task?.type ?? node.step?.type ?? ''
}

// =============================================================================
// Time Utilities
// =============================================================================

/** Calculate elapsed seconds from a session start time to now (uses getCurrentTime) */
export function getElapsedSeconds(startTime: Date): number {
  return Math.floor((getCurrentTime().getTime() - new Date(startTime).getTime()) / 1000)
}

/** Format seconds into stopwatch display (MM:SS or HH:MM:SS) */
export function formatElapsedStopwatch(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number): string => n.toString().padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
}

// =============================================================================
// Status Derivation
// =============================================================================

/**
 * Derive the visual display status of a node based on its underlying
 * task/step state and whether it's actionable (dependencies satisfied).
 */
export function deriveDeepWorkDisplayStatus(
  node: DeepWorkNodeWithData,
  isActionable: boolean,
): DeepWorkNodeStatus {
  if (node.task && !node.task.hasSteps) {
    // Standalone task
    if (node.task.completed) return DeepWorkNodeStatus.Completed
    if (!isActionable) return DeepWorkNodeStatus.Blocked
    return DeepWorkNodeStatus.Pending
  }

  if (node.step) {
    switch (node.step.status) {
      case StepStatus.Completed:
      case StepStatus.Skipped:
        return DeepWorkNodeStatus.Completed
      case StepStatus.InProgress:
        return DeepWorkNodeStatus.Active
      case StepStatus.Waiting:
        return DeepWorkNodeStatus.Waiting
      case StepStatus.Pending:
      default:
        return isActionable ? DeepWorkNodeStatus.Pending : DeepWorkNodeStatus.Blocked
    }
  }

  return DeepWorkNodeStatus.Pending
}

/** Status label + color for display badges */
export const STATUS_LABELS: Record<DeepWorkNodeStatus, { label: string; color: string }> = {
  [DeepWorkNodeStatus.Pending]: { label: 'Ready', color: '#165DFF' },
  [DeepWorkNodeStatus.Active]: { label: 'In Progress', color: '#00b42a' },
  [DeepWorkNodeStatus.Waiting]: { label: 'Waiting', color: '#ff7d00' },
  [DeepWorkNodeStatus.Completed]: { label: 'Completed', color: '#86909c' },
  [DeepWorkNodeStatus.Blocked]: { label: 'Blocked', color: '#f53f3f' },
}

/** Status visual styles for node cards */
export const STATUS_STYLES: Record<DeepWorkNodeStatus, {
  border: string
  borderStyle: string
  background: string
  textDecoration: string
  opacity: number
}> = {
  [DeepWorkNodeStatus.Pending]: {
    border: '2px solid',
    borderStyle: 'solid',
    background: '#ffffff',
    textDecoration: 'none',
    opacity: 1,
  },
  [DeepWorkNodeStatus.Active]: {
    border: '2px solid #00b42a',
    borderStyle: 'solid',
    background: '#f0fff0',
    textDecoration: 'none',
    opacity: 1,
  },
  [DeepWorkNodeStatus.Waiting]: {
    border: '2px dashed #ff7d00',
    borderStyle: 'dashed',
    background: '#fff7e6',
    textDecoration: 'none',
    opacity: 1,
  },
  [DeepWorkNodeStatus.Completed]: {
    border: '2px solid #c9cdd4',
    borderStyle: 'solid',
    background: '#f7f8fa',
    textDecoration: 'line-through',
    opacity: 0.6,
  },
  [DeepWorkNodeStatus.Blocked]: {
    border: '2px dashed #f53f3f',
    borderStyle: 'dashed',
    background: '#fff2f0',
    textDecoration: 'none',
    opacity: 0.8,
  },
}

// =============================================================================
// Session Matching
// =============================================================================

export interface BoardSessionInfo {
  nodeId: string
  node: DeepWorkNodeWithData
  session: UnifiedWorkSession
}

/**
 * Find active work sessions that correspond to nodes on this board.
 * Matches sessions by taskId (for standalone tasks) or stepId (for steps).
 */
export function findBoardSessions(
  nodes: Map<string, DeepWorkNodeWithData>,
  activeWorkSessions: Map<string, UnifiedWorkSession>,
): BoardSessionInfo[] {
  const results: BoardSessionInfo[] = []

  // Build lookup: taskId → node, stepId → node
  const taskIdToNode = new Map<string, DeepWorkNodeWithData>()
  const stepIdToNode = new Map<string, DeepWorkNodeWithData>()

  for (const [, node] of nodes) {
    if (node.taskId && node.task) {
      taskIdToNode.set(node.taskId, node)
    }
    if (node.stepId && node.step) {
      stepIdToNode.set(node.stepId, node)
    }
  }

  for (const [, session] of activeWorkSessions) {
    // Active session = no endTime
    if (session.endTime) continue

    // Check if session matches a step on the board
    if (session.stepId) {
      const node = stepIdToNode.get(session.stepId)
      if (node) {
        results.push({ nodeId: node.id, node, session })
        continue
      }
    }

    // Check if session matches a standalone task on the board
    const node = taskIdToNode.get(session.taskId)
    if (node && !node.task?.hasSteps) {
      results.push({ nodeId: node.id, node, session })
    }
  }

  return results
}

// =============================================================================
// Field Initialization
// =============================================================================

export interface EditableFields {
  name: string
  duration: number
  importance: number
  urgency: number
  type: string
  notes: string
  cognitiveComplexity: number | null
  asyncWaitTime: number
  deadline: Date | null
  deadlineType: string | null
}

/** Build the initial editable fields from a node's underlying data */
export function getInitialFields(node: DeepWorkNodeWithData | null): EditableFields {
  if (!node) {
    return {
      name: '',
      duration: 30,
      importance: 5,
      urgency: 5,
      type: '',
      notes: '',
      cognitiveComplexity: null,
      asyncWaitTime: 0,
      deadline: null,
      deadlineType: null,
    }
  }

  const task = node.task
  const step = node.step

  if (task && !task.hasSteps) {
    return {
      name: task.name,
      duration: task.duration,
      importance: task.importance,
      urgency: task.urgency,
      type: task.type ?? '',
      notes: task.notes ?? '',
      cognitiveComplexity: task.cognitiveComplexity ?? null,
      asyncWaitTime: task.asyncWaitTime,
      deadline: task.deadline ?? null,
      deadlineType: task.deadlineType ?? null,
    }
  }

  if (step) {
    return {
      name: step.name,
      duration: step.duration,
      importance: step.importance ?? node.parentTask?.importance ?? 5,
      urgency: step.urgency ?? node.parentTask?.urgency ?? 5,
      type: step.type,
      notes: step.notes ?? '',
      cognitiveComplexity: step.cognitiveComplexity ?? null,
      asyncWaitTime: step.asyncWaitTime,
      deadline: null, // Steps don't have deadlines
      deadlineType: null,
    }
  }

  return {
    name: '',
    duration: 30,
    importance: 5,
    urgency: 5,
    type: '',
    notes: '',
    cognitiveComplexity: null,
    asyncWaitTime: 0,
    deadline: null,
    deadlineType: null,
  }
}

// =============================================================================
// Grid Position Calculation
// =============================================================================

/**
 * Calculate grid position for importing nodes to the canvas.
 * Nodes are placed in a grid to the right of existing nodes.
 */
export function calculateGridPosition(
  nodeIndex: number,
  existingNodes: DeepWorkNodeWithData[],
  options: { spacingX?: number; spacingY?: number; nodesPerRow?: number; startY?: number } = {},
): { x: number; y: number } {
  const { spacingX = 280, spacingY = 150, nodesPerRow = 4, startY = 100 } = options

  const startX = existingNodes.length > 0
    ? Math.max(...existingNodes.map((n) => n.positionX)) + 300
    : 100

  const col = nodeIndex % nodesPerRow
  const row = Math.floor(nodeIndex / nodesPerRow)

  return {
    x: startX + col * spacingX,
    y: startY + row * spacingY,
  }
}

// =============================================================================
// Task Randomizer
// =============================================================================

/**
 * Given a blocked node, trace up the dependency chain to find the first
 * actionable (unblocked) ancestor that must be completed to unblock it.
 * Returns null if no actionable blocker is found on the board.
 */
export function findFirstUnblockedBlocker(
  nodeId: string,
  nodes: Map<string, DeepWorkNodeWithData>,
  edges: DeepWorkEdge[],
  actionableNodeIds: Set<string>,
  activeSessionNodeIds: Set<string>,
): DeepWorkNodeWithData | null {
  // Build reverse lookup: targetNodeId → sourceNodeIds (what blocks this node)
  const blockersOf = new Map<string, string[]>()
  for (const edge of edges) {
    const existing = blockersOf.get(edge.targetNodeId) ?? []
    existing.push(edge.sourceNodeId)
    blockersOf.set(edge.targetNodeId, existing)
  }

  // BFS up the dependency chain
  const visited = new Set<string>()
  const queue = [nodeId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    const blockers = blockersOf.get(current) ?? []
    for (const blockerId of blockers) {
      if (visited.has(blockerId)) continue

      // Is this blocker actionable and not already being worked on?
      if (actionableNodeIds.has(blockerId) && !activeSessionNodeIds.has(blockerId)) {
        const node = nodes.get(blockerId)
        if (node) return node
      }

      // Not actionable — it's also blocked, so keep tracing upward
      queue.push(blockerId)
    }
  }

  return null
}

/**
 * Pick a random node from the board using weighted-by-proxy selection.
 *
 * Randomizes over ALL incomplete nodes (including blocked ones), not just
 * actionable ones. If the chosen node is blocked, traces up the dependency
 * chain to find the first actionable ancestor — the node that must be
 * completed to start unblocking the chain.
 *
 * This naturally gives bottleneck nodes higher selection probability
 * proportional to how many nodes they block.
 */
export function pickRandomActionableNode(
  nodes: Map<string, DeepWorkNodeWithData>,
  actionableNodeIds: Set<string>,
  activeSessionNodeIds: Set<string>,
  edges: DeepWorkEdge[] = [],
): DeepWorkNodeWithData | null {
  // Build pool of ALL incomplete nodes (actionable + blocked), excluding completed and active
  const completedNodeIds = new Set<string>()
  for (const [nodeId, node] of nodes) {
    if (node.task && !node.task.hasSteps && node.task.completed) {
      completedNodeIds.add(nodeId)
    }
    if (node.step && (node.step.status === StepStatus.Completed || node.step.status === StepStatus.Skipped)) {
      completedNodeIds.add(nodeId)
    }
  }

  const allIncomplete = Array.from(nodes.keys())
    .filter((id) => !completedNodeIds.has(id) && !activeSessionNodeIds.has(id))

  if (allIncomplete.length === 0) return null

  // Pick a random incomplete node
  const pickedId = allIncomplete[Math.floor(Math.random() * allIncomplete.length)]!

  // If it's actionable, return it directly
  if (actionableNodeIds.has(pickedId)) {
    return nodes.get(pickedId) ?? null
  }

  // It's blocked — trace up to find the first actionable blocker
  const unblocker = findFirstUnblockedBlocker(pickedId, nodes, edges, actionableNodeIds, activeSessionNodeIds)
  if (unblocker) return unblocker

  // Fallback: if chain tracing found nothing (e.g., all blockers are also active),
  // fall back to picking from actionable nodes directly
  const fallbackCandidates = Array.from(actionableNodeIds)
    .filter((id) => !activeSessionNodeIds.has(id))
    .map((id) => nodes.get(id))
    .filter((n): n is DeepWorkNodeWithData => n !== undefined)

  if (fallbackCandidates.length === 0) return null
  return fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)]!
}
