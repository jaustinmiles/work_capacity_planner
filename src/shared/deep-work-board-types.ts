/**
 * Deep Work Board Types
 *
 * Type definitions for the Deep Work Board feature — a freeform whiteboard canvas
 * for creating, connecting, and executing tasks without leaving the screen.
 *
 * Architecture: DeepWorkNode is a "projection" — it stores canvas position metadata
 * while the canonical task/step data lives in Task/TaskStep. This means the scheduler,
 * timers, and sprint system all work automatically with zero duplication.
 */

import type { Task, TaskStep } from './types'

// =============================================================================
// Core Board Types
// =============================================================================

/**
 * DeepWorkBoard — A named whiteboard canvas for freeform task planning.
 * Session-scoped, persists layout (zoom, pan, node positions) across restarts.
 */
export interface DeepWorkBoard {
  id: string
  sessionId: string
  name: string
  zoom: number
  panX: number
  panY: number
  actionPanelOpen: boolean
  actionPanelWidth: number
  createdAt: Date
  updatedAt: Date
}

/**
 * DeepWorkNode — Canvas position for a task or workflow step on a board.
 * A node has EITHER taskId (standalone task) OR stepId (workflow step), never both.
 */
export interface DeepWorkNode {
  id: string
  boardId: string
  taskId: string | null
  stepId: string | null
  positionX: number
  positionY: number
  width: number
  height: number
  createdAt: Date
  updatedAt: Date
}

/**
 * DeepWorkNode hydrated with the referenced Task or TaskStep data.
 * Used in the UI layer where we need both canvas position and task content.
 */
export interface DeepWorkNodeWithData extends DeepWorkNode {
  task: Task | null
  step: TaskStep | null
  /** The parent workflow Task when this node is a step */
  parentTask: Task | null
}

/**
 * Board loaded with all its nodes (hydrated with task/step data).
 */
export interface DeepWorkBoardWithNodes extends DeepWorkBoard {
  nodes: DeepWorkNodeWithData[]
}

// =============================================================================
// Edge & Cluster Types
// =============================================================================

/**
 * Represents a dependency edge on the canvas.
 * Derived from TaskStep.dependsOn (intra-workflow) or EndeavorDependency (cross-workflow).
 */
export interface DeepWorkEdge {
  id: string
  sourceNodeId: string  // DeepWorkNode ID of the dependency (must complete first)
  targetNodeId: string  // DeepWorkNode ID of the dependent (blocked until source completes)
  edgeType: DeepWorkEdgeType
}

/** Classification of edge types for visual styling */
export enum DeepWorkEdgeType {
  /** Dependency between steps in the same workflow */
  IntraWorkflow = 'intra_workflow',
  /** Dependency between nodes in different workflows */
  CrossWorkflow = 'cross_workflow',
}

/**
 * A cluster of connected nodes forming a workflow.
 * Computed by the Union-Find clustering algorithm from edge relationships.
 */
export interface DeepWorkCluster {
  /** Stable identifier — the oldest node ID in the cluster */
  id: string
  /** All DeepWorkNode IDs in this cluster */
  nodeIds: Set<string>
  /** Nodes with no intra-cluster dependencies (entry points) */
  rootNodeIds: string[]
  /** Nodes nothing depends on (exit points) */
  terminalNodeIds: string[]
  /** The workflow Task ID if this cluster maps to a persisted workflow */
  workflowTaskId: string | null
  /** Display name — derived from workflow name or first node name */
  displayName: string
}

// =============================================================================
// Node Status Types
// =============================================================================

/**
 * Visual status of a node on the Deep Work Board canvas.
 * Derived from the underlying Task/TaskStep status and dependency state.
 */
export enum DeepWorkNodeStatus {
  /** Not started, dependencies satisfied */
  Pending = 'pending',
  /** Currently being worked on (active WorkSession) */
  Active = 'active',
  /** Completed step, waiting for async response time to elapse */
  Waiting = 'waiting',
  /** Task/step is completed */
  Completed = 'completed',
  /** Dependencies not yet satisfied — cannot be started */
  Blocked = 'blocked',
}

// =============================================================================
// Morph Strategy Types
// =============================================================================

/**
 * Strategy for what happens when two nodes are connected with an edge.
 * Determined by the current state of the source and target nodes.
 */
export enum MorphStrategy {
  /** Two orphan Tasks → both become Steps in a NEW workflow */
  CreateWorkflow = 'create_workflow',
  /** Orphan Task joins an existing workflow as a new Step */
  JoinWorkflow = 'join_workflow',
  /** Both nodes are already Steps in the same workflow — just add dependsOn */
  IntraWorkflow = 'intra_workflow',
  /** Nodes are in different workflows — create EndeavorDependency */
  CrossWorkflow = 'cross_workflow',
}

/**
 * Describes all mutations needed for a morph operation.
 * The server executes this atomically in a Prisma $transaction().
 */
export interface MorphResult {
  strategy: MorphStrategy

  /** New workflow Task to create (when strategy is CreateWorkflow) */
  newWorkflowTask: Partial<Task> | null

  /** Steps to create (from morphed Tasks) */
  stepCreations: Array<{
    id: string
    taskId: string  // parent workflow
    name: string
    duration: number
    type: string
    dependsOn: string[]
    stepIndex: number
    importance: number
    urgency: number
    asyncWaitTime: number
    cognitiveComplexity: number | null
    notes: string | null
  }>

  /** Steps to update (adding new dependsOn entries) */
  stepUpdates: Array<{
    id: string
    dependsOn: string[]
  }>

  /** Tasks to archive (original standalone tasks that became steps) */
  taskArchiveIds: string[]

  /** WorkSession reassignments (taskId/stepId changes) */
  workSessionUpdates: Array<{
    originalTaskId: string
    newTaskId: string
    newStepId: string
  }>

  /** DeepWorkNode updates (taskId ↔ stepId identity changes) */
  nodeIdentityUpdates: Array<{
    nodeId: string
    taskId: string | null
    stepId: string | null
  }>

  /** EndeavorDependency to create (for cross-workflow connections) */
  crossWorkflowDependency: {
    endeavorId: string
    blockedStepId: string
    blockingStepId: string
    blockingTaskId: string
    isHardBlock: boolean
  } | null
}

// =============================================================================
// Input Types for tRPC Endpoints
// =============================================================================

export interface CreateDeepWorkBoardInput {
  name: string
}

export interface UpdateDeepWorkBoardInput {
  id: string
  name?: string
  actionPanelOpen?: boolean
  actionPanelWidth?: number
}

export interface CreateTaskAndNodeInput {
  boardId: string
  name: string
  positionX: number
  positionY: number
  /** Optional initial values for the quick-expand panel */
  duration?: number
  type?: string
  importance?: number
  urgency?: number
}

export interface UpdateNodePositionInput {
  nodeId: string
  positionX: number
  positionY: number
}

export interface BatchUpdateNodePositionsInput {
  updates: UpdateNodePositionInput[]
}

export interface SaveViewportInput {
  boardId: string
  zoom: number
  panX: number
  panY: number
}

export interface CreateEdgeInput {
  boardId: string
  sourceNodeId: string  // the dependency (completes first)
  targetNodeId: string  // the dependent (blocked until source completes)
}

export interface RemoveEdgeInput {
  boardId: string
  sourceNodeId: string
  targetNodeId: string
}

export interface ImportFromSprintInput {
  boardId: string
}

export interface AddExistingNodeInput {
  boardId: string
  taskId?: string
  stepId?: string
  positionX: number
  positionY: number
}
