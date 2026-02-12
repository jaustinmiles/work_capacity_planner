/**
 * Graph Layout Utilities
 *
 * Pure functions for computing ReactFlow node/edge layouts from endeavor data.
 * Uses topological sort + level-based positioning for workflow steps,
 * and a responsive grid arrangement for endeavor regions.
 */

import type { Node, Edge } from 'reactflow'
import { MarkerType } from 'reactflow'
import type { EndeavorWithTasks, TaskStep, EndeavorDependencyWithNames } from '@shared/types'
import type { UserTaskType } from '@shared/user-task-types'
import { calculateEndeavorProgress } from '@shared/endeavor-utils'

// Layout constants
const NODE_WIDTH = 220
const NODE_HEIGHT = 90
const HORIZONTAL_SPACING = 280
const VERTICAL_SPACING = 130
const REGION_PADDING = 60
const REGION_HEADER_HEIGHT = 50
const REGION_GAP = 80
const GRID_COLUMNS = 2

interface LayoutResult {
  nodes: Node[]
  edges: Edge[]
}

/**
 * Hex color to rgba string
 */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Calculate dependency levels for steps using DFS
 * Returns a map of stepId → level (0-based, where 0 = no dependencies)
 */
function calculateStepLevels(steps: TaskStep[]): Map<string, number> {
  const levelMap = new Map<string, number>()
  const visiting = new Set<string>()
  const stepMap = new Map<string, TaskStep>()
  steps.forEach(s => stepMap.set(s.id, s))

  function getLevel(stepId: string): number {
    if (levelMap.has(stepId)) return levelMap.get(stepId)!
    if (visiting.has(stepId)) return 0 // cycle

    visiting.add(stepId)
    const step = stepMap.get(stepId)
    if (!step) { visiting.delete(stepId); return 0 }

    let maxDepLevel = -1
    for (const depId of step.dependsOn) {
      if (stepMap.has(depId)) {
        maxDepLevel = Math.max(maxDepLevel, getLevel(depId))
      }
    }

    const level = maxDepLevel + 1
    levelMap.set(stepId, level)
    visiting.delete(stepId)
    return level
  }

  steps.forEach(s => getLevel(s.id))
  return levelMap
}

/**
 * Compute the inner layout for a single workflow task's steps
 * Returns positioned nodes and the bounding box size
 */
function layoutWorkflowSteps(
  steps: TaskStep[],
  endeavorId: string,
  taskId: string,
  taskName: string,
  offsetX: number,
  offsetY: number,
  userTypes: UserTaskType[],
): { nodes: Node[]; edges: Edge[]; width: number; height: number } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  if (steps.length === 0) return { nodes, edges, width: 0, height: 0 }

  const levelMap = calculateStepLevels(steps)

  // Group steps by level
  const levelGroups = new Map<number, TaskStep[]>()
  steps.forEach(step => {
    const level = levelMap.get(step.id) ?? 0
    const group = levelGroups.get(level) ?? []
    group.push(step)
    levelGroups.set(level, group)
  })

  // Sort within levels by stepIndex for stability
  levelGroups.forEach(group => {
    group.sort((a, b) => a.stepIndex - b.stepIndex)
  })

  const maxLevel = Math.max(...Array.from(levelGroups.keys()), 0)
  let maxRowCount = 0

  // Position nodes
  levelGroups.forEach((group, level) => {
    maxRowCount = Math.max(maxRowCount, group.length)
    group.forEach((step, rowIndex) => {
      nodes.push({
        id: `step-${step.id}`,
        type: 'taskStep',
        parentNode: `endeavor-${endeavorId}`,
        extent: 'parent',
        position: {
          x: offsetX + level * HORIZONTAL_SPACING,
          y: offsetY + rowIndex * VERTICAL_SPACING,
        },
        data: {
          label: step.name,
          duration: step.duration,
          type: step.type,
          status: step.status,
          stepIndex: step.stepIndex,
          taskId,
          taskName,
          endeavorId,
          userTypes,
        },
        draggable: false,
      })
    })
  })

  // Create edges for step dependencies
  const stepIdSet = new Set(steps.map(s => s.id))
  steps.forEach(step => {
    step.dependsOn.forEach(depId => {
      if (stepIdSet.has(depId)) {
        edges.push({
          id: `edge-${depId}-${step.id}`,
          source: `step-${depId}`,
          target: `step-${step.id}`,
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#86909c', strokeWidth: 1.5 },
        })
      }
    })
  })

  const width = (maxLevel + 1) * HORIZONTAL_SPACING + NODE_WIDTH
  const height = maxRowCount * VERTICAL_SPACING + NODE_HEIGHT

  return { nodes, edges, width, height }
}

/**
 * Layout a simple task (no steps) as a single node within an endeavor region
 */
function layoutSimpleTask(
  task: EndeavorWithTasks['items'][0]['task'],
  endeavorId: string,
  offsetX: number,
  offsetY: number,
  userTypes: UserTaskType[],
): { node: Node; width: number; height: number } {
  const node: Node = {
    id: `task-${task.id}`,
    type: 'taskStep',
    parentNode: `endeavor-${endeavorId}`,
    extent: 'parent',
    position: { x: offsetX, y: offsetY },
    data: {
      label: task.name,
      duration: task.duration,
      type: task.type ?? '',
      status: task.completed ? 'completed' : (task.overallStatus ?? 'pending'),
      stepIndex: -1,
      taskId: task.id,
      taskName: task.name,
      endeavorId,
      isSimpleTask: true,
      userTypes,
    },
    draggable: false,
  }

  return { node, width: NODE_WIDTH, height: NODE_HEIGHT }
}

/**
 * Compute the full graph layout for all endeavors
 *
 * Strategy:
 * 1. For each endeavor, layout its workflow steps and simple tasks vertically
 * 2. Calculate the bounding box for each endeavor region
 * 3. Arrange endeavor regions in a grid
 */
export function computeGraphLayout(
  endeavors: EndeavorWithTasks[],
  userTypes: UserTaskType[],
): LayoutResult {
  const allNodes: Node[] = []
  const allEdges: Edge[] = []

  // First pass: compute inner layouts to determine region sizes
  const regionLayouts: Array<{
    endeavor: EndeavorWithTasks
    innerNodes: Node[]
    innerEdges: Edge[]
    contentWidth: number
    contentHeight: number
  }> = []

  for (const endeavor of endeavors) {
    const innerNodes: Node[] = []
    const innerEdges: Edge[] = []
    let maxContentWidth = 0
    let currentY = REGION_HEADER_HEIGHT

    for (const item of endeavor.items) {
      const task = item.task

      if (task.hasSteps && task.steps && task.steps.length > 0) {
        // Workflow with steps
        const result = layoutWorkflowSteps(
          task.steps,
          endeavor.id,
          task.id,
          task.name,
          REGION_PADDING,
          currentY,
          userTypes,
        )
        innerNodes.push(...result.nodes)
        innerEdges.push(...result.edges)
        maxContentWidth = Math.max(maxContentWidth, result.width)
        currentY += result.height + VERTICAL_SPACING * 0.5
      } else {
        // Simple task
        const result = layoutSimpleTask(
          task,
          endeavor.id,
          REGION_PADDING,
          currentY,
          userTypes,
        )
        innerNodes.push(result.node)
        maxContentWidth = Math.max(maxContentWidth, result.width)
        currentY += result.height + VERTICAL_SPACING * 0.5
      }
    }

    regionLayouts.push({
      endeavor,
      innerNodes,
      innerEdges,
      contentWidth: maxContentWidth + REGION_PADDING * 2,
      contentHeight: currentY + REGION_PADDING,
    })
  }

  // Second pass: arrange regions in a grid
  const columnHeights = new Array(GRID_COLUMNS).fill(0)

  for (const layout of regionLayouts) {
    // Find the shortest column
    let minCol = 0
    for (let i = 1; i < GRID_COLUMNS; i++) {
      if (columnHeights[i] < columnHeights[minCol]) minCol = i
    }

    const regionWidth = Math.max(layout.contentWidth, 400)
    const regionHeight = Math.max(layout.contentHeight, 200)

    const regionX = minCol * (regionWidth + REGION_GAP)
    const regionY = columnHeights[minCol]

    const progress = calculateEndeavorProgress(layout.endeavor)
    const color = layout.endeavor.color ?? '#165DFF'

    // Create the endeavor region (group) node
    const regionNode: Node = {
      id: `endeavor-${layout.endeavor.id}`,
      type: 'endeavorRegion',
      position: { x: regionX, y: regionY },
      data: {
        label: layout.endeavor.name,
        status: layout.endeavor.status,
        color,
        progress,
        description: layout.endeavor.description,
        endeavorId: layout.endeavor.id,
      },
      style: {
        width: regionWidth,
        height: regionHeight,
      },
      draggable: true,
    }

    allNodes.push(regionNode)
    allNodes.push(...layout.innerNodes)
    allEdges.push(...layout.innerEdges)

    columnHeights[minCol] += regionHeight + REGION_GAP
  }

  return { nodes: allNodes, edges: allEdges }
}

/**
 * Convert EndeavorDependency[] into ReactFlow Edge objects
 * for cross-endeavor/cross-workflow dependencies.
 *
 * These are rendered with the custom DependencyEdge component.
 */
export function computeCrossEndeavorEdges(
  dependencies: Map<string, EndeavorDependencyWithNames[]>,
  isEditable: boolean,
): Edge[] {
  const edges: Edge[] = []

  for (const [endeavorId, deps] of dependencies) {
    for (const dep of deps) {
      const sourceNodeId = `step-${dep.blockingStepId}`
      const targetNodeId = dep.blockedStepId
        ? `step-${dep.blockedStepId}`
        : dep.blockedTaskId
          ? `task-${dep.blockedTaskId}`
          : null

      if (!targetNodeId) continue

      edges.push({
        id: `dep-${dep.id}`,
        source: sourceNodeId,
        target: targetNodeId,
        type: 'dependency',
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: dep.isHardBlock ? '#F77234' : '#F7BA1E',
        },
        data: {
          isHardBlock: dep.isHardBlock,
          notes: dep.notes,
          dependencyId: dep.id,
          isEditable,
          endeavorId,
        },
      })
    }
  }

  return edges
}
