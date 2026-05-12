/**
 * Decision Helper Types
 *
 * Types for the Socratic decision engine, force-directed graph,
 * and decision-to-task extraction. Ported from Decision Helper's
 * runtime shapes, converted to strict TypeScript.
 */

import { TreeNodeType, ThinkingSentiment } from './enums'

// ============================================================================
// Core Decision State
// ============================================================================

export interface DecisionOption {
  readonly id: string
  readonly label: string
  readonly pros: readonly string[]
  readonly cons: readonly string[]
}

export interface DecisionFactor {
  readonly id: string
  readonly name: string
  readonly weight: number // 0.0 to 1.0
}

export interface TreeNode {
  readonly id: string
  readonly label: string
  readonly type: TreeNodeType
}

export interface TreeEdge {
  readonly source: string
  readonly target: string
  readonly label?: string
}

export interface TimelineEvent {
  readonly label: string
  readonly sentiment: ThinkingSentiment
  readonly timestamp: string // ISO 8601
}

export interface DecisionState {
  topic: string | null
  options: DecisionOption[]
  factors: DecisionFactor[]
  timeline: TimelineEvent[]
  tree: { nodes: TreeNode[]; edges: TreeEdge[] }
}

// ============================================================================
// Claude Response Shape
// ============================================================================

/**
 * Structured visual data returned by Claude's Socratic reflect call.
 * Merged into the running DecisionState after each turn.
 */
export interface ClaudeVisualResponse {
  topic?: string
  newOptions?: DecisionOption[]
  updatedOptions?: Array<{
    id: string
    newPros?: string[]
    newCons?: string[]
  }>
  newFactors?: DecisionFactor[]
  newTreeNodes?: TreeNode[]
  newTreeEdges?: TreeEdge[]
  timelineEvent?: Omit<TimelineEvent, 'timestamp'>
}

// ============================================================================
// Connectivity Score
// ============================================================================

export interface ConnectivityScore {
  readonly score: number // 0-1 composite
  readonly detail: string
  readonly ready: boolean
  readonly nodeCount: number
  readonly edgeCount: number
  readonly optionCount: number
  readonly factorCount: number
  readonly coveredOptions: number
}

// ============================================================================
// Decision-to-Task Extraction
// ============================================================================

export interface DecisionExtraction {
  newTasks: Array<{
    name: string
    duration: number
    importance: number
    urgency: number
    type: string
    reasoning: string
    sourceNodeIds: string[]
  }>
  newWorkflows: Array<{
    name: string
    steps: Array<{ name: string; duration: number; type: string }>
    reasoning: string
    sourceNodeIds: string[]
  }>
  taskUpdates: Array<{
    taskId: string
    changes: {
      importance?: number
      urgency?: number
      notes?: string
      overallStatus?: string
    }
    reasoning: string
  }>
  priorityReassignments: Array<{
    taskId: string
    oldImportance: number
    newImportance: number
    oldUrgency: number
    newUrgency: number
    reasoning: string
  }>
}

// ============================================================================
// Utility Functions
// ============================================================================

export function emptyDecisionState(): DecisionState {
  return {
    topic: null,
    options: [],
    factors: [],
    timeline: [],
    tree: { nodes: [], edges: [] },
  }
}
