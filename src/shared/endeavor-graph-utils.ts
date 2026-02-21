/**
 * Endeavor Graph Utilities
 *
 * Functions for critical path computation and time-by-type breakdown
 * across endeavors. Used by the graph view for highlighting and panels.
 */

import { StepStatus, GraphNodePrefix, GraphEdgePrefix } from './enums'
import { makeNodeId, makeEdgeId } from './graph-node-ids'
import type { EndeavorWithTasks, EndeavorDependencyWithNames, TaskStep } from './types'
import type { UserTaskType } from './user-task-types'
import { getTypeColor, getTypeName } from './user-task-types'

export interface CriticalPathResult {
  nodeIds: Set<string>   // step-{id} or task-{id} format
  edgeIds: Set<string>   // edge-{source}-{target} format
  totalDuration: number  // minutes
}

export interface TimeByTypeEntry {
  typeId: string
  typeName: string
  typeColor: string
  typeEmoji: string
  remainingMinutes: number
  totalMinutes: number
}

/**
 * Compute the critical path through an endeavor
 *
 * Finds the longest-duration path from any entry step to the goal,
 * considering only incomplete steps. Returns the set of node/edge IDs
 * on that path for visual highlighting.
 */
export function computeEndeavorCriticalPath(
  endeavor: EndeavorWithTasks,
  crossDeps: EndeavorDependencyWithNames[],
): CriticalPathResult {
  const empty: CriticalPathResult = { nodeIds: new Set(), edgeIds: new Set(), totalDuration: 0 }

  // Collect all incomplete steps across all tasks
  const allSteps: Array<TaskStep & { graphNodeId: string }> = []
  const stepMap = new Map<string, TaskStep & { graphNodeId: string }>()

  for (const item of endeavor.items) {
    const task = item.task
    if (task.hasSteps && task.steps) {
      for (const step of task.steps) {
        if (step.status === StepStatus.Completed || step.status === StepStatus.Skipped) continue
        const enriched = { ...step, graphNodeId: makeNodeId(GraphNodePrefix.Step, step.id) }
        allSteps.push(enriched)
        stepMap.set(step.id, enriched)
      }
    } else if (!task.completed) {
      // Simple task as a single "step"
      const pseudoStep = {
        id: task.id,
        name: task.name,
        duration: task.duration,
        actualDuration: task.actualDuration,
        type: task.type ?? '',
        taskId: task.id,
        dependsOn: task.dependencies,
        asyncWaitTime: 0,
        status: StepStatus.Pending,
        stepIndex: 0,
        percentComplete: 0,
        graphNodeId: makeNodeId(GraphNodePrefix.Task, task.id),
      } as TaskStep & { graphNodeId: string }
      allSteps.push(pseudoStep)
      stepMap.set(task.id, pseudoStep)
    }
  }

  if (allSteps.length === 0) return empty

  // Build dependency map including cross-endeavor deps
  const deps = new Map<string, string[]>()
  for (const step of allSteps) {
    deps.set(step.id, [...step.dependsOn.filter(d => stepMap.has(d))])
  }

  for (const dep of crossDeps) {
    if (dep.blockedStepId && stepMap.has(dep.blockedStepId) && stepMap.has(dep.blockingStepId)) {
      const existing = deps.get(dep.blockedStepId) ?? []
      existing.push(dep.blockingStepId)
      deps.set(dep.blockedStepId, existing)
    }
  }

  // Find dependents (reverse map) to identify terminal steps
  const hasDependents = new Set<string>()
  for (const [, depList] of deps) {
    for (const d of depList) {
      hasDependents.add(d)
    }
  }
  // Actually, we need to find which steps are depended ON by others
  const isDependedOnBy = new Map<string, string[]>()
  for (const [stepId, depList] of deps) {
    for (const d of depList) {
      const list = isDependedOnBy.get(d) ?? []
      list.push(stepId)
      isDependedOnBy.set(d, list)
    }
  }

  // Terminal steps: those that no other step depends on
  const terminalSteps = allSteps.filter(s => {
    const dependents = isDependedOnBy.get(s.id) ?? []
    return dependents.length === 0
  })

  if (terminalSteps.length === 0) return empty

  // DP: longest path ending at each step
  const memo = new Map<string, { duration: number; path: string[] }>()

  function longestPathTo(stepId: string): { duration: number; path: string[] } {
    if (memo.has(stepId)) return memo.get(stepId)!

    const step = stepMap.get(stepId)
    if (!step) {
      const result = { duration: 0, path: [] }
      memo.set(stepId, result)
      return result
    }

    const stepDeps = deps.get(stepId) ?? []
    if (stepDeps.length === 0) {
      const result = { duration: step.duration, path: [stepId] }
      memo.set(stepId, result)
      return result
    }

    let bestDep = { duration: 0, path: [] as string[] }
    for (const depId of stepDeps) {
      const sub = longestPathTo(depId)
      if (sub.duration > bestDep.duration) {
        bestDep = sub
      }
    }

    const result = {
      duration: step.duration + bestDep.duration,
      path: [...bestDep.path, stepId],
    }
    memo.set(stepId, result)
    return result
  }

  // Find the terminal step with the longest path
  let bestResult = { duration: 0, path: [] as string[] }
  for (const terminal of terminalSteps) {
    const result = longestPathTo(terminal.id)
    if (result.duration > bestResult.duration) {
      bestResult = result
    }
  }

  // Convert path to node IDs and edge IDs
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()

  for (const stepId of bestResult.path) {
    const step = stepMap.get(stepId)
    if (step) nodeIds.add(step.graphNodeId)
  }

  for (let i = 0; i < bestResult.path.length - 1; i++) {
    const from = bestResult.path[i]!
    const to = bestResult.path[i + 1]!
    edgeIds.add(makeEdgeId(GraphEdgePrefix.Internal, from, to))
  }

  return {
    nodeIds,
    edgeIds,
    totalDuration: bestResult.duration,
  }
}

/**
 * Compute remaining time grouped by task type for an endeavor
 */
export function computeTimeByType(
  endeavor: EndeavorWithTasks,
  userTypes: UserTaskType[],
): TimeByTypeEntry[] {
  const typeMap = new Map<string, { remaining: number; total: number }>()

  for (const item of endeavor.items) {
    const task = item.task
    if (task.hasSteps && task.steps) {
      for (const step of task.steps) {
        const existing = typeMap.get(step.type) ?? { remaining: 0, total: 0 }
        existing.total += step.duration
        if (step.status !== StepStatus.Completed && step.status !== StepStatus.Skipped) {
          existing.remaining += step.duration
        }
        typeMap.set(step.type, existing)
      }
    } else {
      const typeId = task.type ?? 'unknown'
      const existing = typeMap.get(typeId) ?? { remaining: 0, total: 0 }
      existing.total += task.duration
      if (!task.completed) {
        existing.remaining += task.duration
      }
      typeMap.set(typeId, existing)
    }
  }

  return Array.from(typeMap.entries())
    .map(([typeId, data]) => {
      const userType = userTypes.find(t => t.id === typeId)
      return {
        typeId,
        typeName: userType?.name ?? getTypeName(userTypes, typeId) ?? typeId,
        typeColor: userType?.color ?? getTypeColor(userTypes, typeId) ?? '#165DFF',
        typeEmoji: userType?.emoji ?? '',
        remainingMinutes: data.remaining,
        totalMinutes: data.total,
      }
    })
    .filter(entry => entry.totalMinutes > 0)
    .sort((a, b) => b.remainingMinutes - a.remainingMinutes)
}

/**
 * Compute the union of critical paths across all endeavors
 *
 * Returns the combined set of node/edge IDs that are on any endeavor's critical path.
 */
export function computeAllCriticalPaths(
  endeavors: EndeavorWithTasks[],
  dependencies: Map<string, EndeavorDependencyWithNames[]>,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const allNodeIds = new Set<string>()
  const allEdgeIds = new Set<string>()

  for (const endeavor of endeavors) {
    const crossDeps = dependencies.get(endeavor.id) ?? []
    const result = computeEndeavorCriticalPath(endeavor, crossDeps)
    result.nodeIds.forEach(id => allNodeIds.add(id))
    result.edgeIds.forEach(id => allEdgeIds.add(id))
  }

  return { nodeIds: allNodeIds, edgeIds: allEdgeIds }
}

/**
 * Aggregate remaining time by task type across all endeavors
 *
 * Merges per-endeavor time breakdowns into a single sorted list.
 */
export function aggregateTimeByType(
  endeavors: EndeavorWithTasks[],
  userTypes: UserTaskType[],
): Array<{
  typeName: string
  typeColor: string
  typeEmoji: string
  remaining: number
  total: number
}> {
  const typeMap = new Map<string, {
    typeName: string
    typeColor: string
    typeEmoji: string
    remaining: number
    total: number
  }>()

  for (const endeavor of endeavors) {
    const entries = computeTimeByType(endeavor, userTypes)
    for (const entry of entries) {
      const existing = typeMap.get(entry.typeId)
      if (existing) {
        existing.remaining += entry.remainingMinutes
        existing.total += entry.totalMinutes
      } else {
        typeMap.set(entry.typeId, {
          typeName: entry.typeName,
          typeColor: entry.typeColor,
          typeEmoji: entry.typeEmoji,
          remaining: entry.remainingMinutes,
          total: entry.totalMinutes,
        })
      }
    }
  }

  return Array.from(typeMap.values())
    .filter(e => e.total > 0)
    .sort((a, b) => b.remaining - a.remaining)
}
