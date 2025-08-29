/**
 * Common scheduling utilities shared between different schedulers
 * This prevents duplication of core scheduling logic
 */

import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskStep } from '@shared/types'

export interface WorkItem {
  id: string
  name: string
  type: 'task' | 'workflow-step' | 'async-wait'
  duration: number
  priority: number
  deadline?: Date
  dependencies?: string[]
  isAsyncTrigger?: boolean
  asyncWaitTime?: number
  cognitiveComplexity?: number
  originalItem: Task | TaskStep | SequencedTask

  // Runtime properties
  startTime?: Date
  endTime?: Date
  criticalPath?: number
}

export interface TopologicalSortResult {
  sorted: WorkItem[]
  warnings: string[]
}

/**
 * Perform topological sort on work items with dependencies
 * Ensures dependencies are scheduled before dependent items
 */
export function topologicalSort(items: WorkItem[]): TopologicalSortResult {
  const sorted: WorkItem[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const itemMap = new Map<string, WorkItem>()
  const warnings: string[] = []

  // Build item map for quick lookup
  items.forEach(item => itemMap.set(item.id, item))

  function visit(item: WorkItem): void {
    if (visited.has(item.id)) return
    if (visiting.has(item.id)) {
      // Circular dependency detected
      warnings.push(`Circular dependency detected involving ${item.name}`)
      return
    }

    visiting.add(item.id)

    // Visit dependencies first
    if (item.dependencies && item.dependencies.length > 0) {
      for (const depId of item.dependencies) {
        const dep = itemMap.get(depId)
        if (dep) {
          visit(dep)
        }
      }
    }

    visiting.delete(item.id)
    visited.add(item.id)
    sorted.push(item)
  }

  // Visit all items
  items.forEach(item => visit(item))

  if (warnings.length > 0) {
    console.warn('Topological sort warnings:', warnings)
  }

  return { sorted, warnings }
}

/**
 * Calculate critical path for all items
 * Returns a map of item ID to critical path length
 */
export function calculateCriticalPaths(items: WorkItem[]): Map<string, number> {
  const criticalPathLength = new Map<string, number>()
  const itemMap = new Map<string, WorkItem>()

  items.forEach(item => itemMap.set(item.id, item))

  function calculatePath(itemId: string): number {
    if (criticalPathLength.has(itemId)) {
      return criticalPathLength.get(itemId)!
    }

    const item = itemMap.get(itemId)
    if (!item) return 0

    let maxDepPath = 0

    if (item.dependencies && item.dependencies.length > 0) {
      for (const depId of item.dependencies) {
        const depPath = calculatePath(depId)
        maxDepPath = Math.max(maxDepPath, depPath)
      }
    }

    // For async triggers, include the wait time in the critical path
    const asyncTime = item.isAsyncTrigger ? (item.asyncWaitTime || 0) : 0
    const totalPath = item.duration + asyncTime + maxDepPath

    criticalPathLength.set(itemId, totalPath)
    return totalPath
  }

  // Calculate critical path for all items
  items.forEach(item => calculatePath(item.id))

  return criticalPathLength
}

/**
 * Convert tasks and workflows to work items
 */
export function createWorkItems(
  tasks: Task[],
  workflows: SequencedTask[],
): WorkItem[] {
  const workItems: WorkItem[] = []

  // Add tasks as work items
  tasks.forEach(task => {
    if (!task.completed) {
      workItems.push({
        id: task.id,
        name: task.name,
        type: 'task',
        duration: task.duration,
        priority: (task.importance || 5) * (task.urgency || 5),
        deadline: task.deadline,
        dependencies: task.dependencies,
        isAsyncTrigger: task.isAsyncTrigger,
        asyncWaitTime: task.asyncWaitTime,
        cognitiveComplexity: task.cognitiveComplexity,
        originalItem: task,
      })
    }
  })

  // Add workflow steps as work items
  workflows.forEach(workflow => {
    if (!workflow.completed && workflow.steps) {
      workflow.steps.forEach((step, index) => {
        if (!step.percentComplete || step.percentComplete < 100) {
          const dependencies = [...(step.dependsOn || [])]
          if (index > 0) {
            // Add dependency on previous step
            dependencies.push(workflow.steps![index - 1].id)
          }

          workItems.push({
            id: step.id,
            name: `${workflow.name}: ${step.name}`,
            type: 'workflow-step',
            duration: step.duration,
            priority: 50, // Default priority for workflow steps
            deadline: workflow.deadline,
            dependencies: dependencies.length > 0 ? dependencies : undefined,
            isAsyncTrigger: step.isAsyncTrigger || false,
            asyncWaitTime: step.asyncWaitTime || 0,
            cognitiveComplexity: step.cognitiveComplexity,
            originalItem: step,
          })
        }
      })
    }
  })

  return workItems
}

/**
 * Check if dependencies are satisfied for scheduling
 */
export interface DependencyCheckResult {
  canSchedule: boolean
  earliestStart?: Date
  waitingOnAsync?: boolean
  missingDependencies?: string[]
}

export function checkDependencies(
  item: WorkItem,
  completedItems: Set<string>,
  asyncEndTimes: Map<string, Date>,
  currentTime: Date,
): DependencyCheckResult {
  if (!item.dependencies || item.dependencies.length === 0) {
    return { canSchedule: true }
  }

  let canSchedule = true
  let earliestStart = currentTime
  const missingDeps: string[] = []
  let waitingOnAsync = false

  for (const depId of item.dependencies) {
    if (!completedItems.has(depId)) {
      // Check if it's an async task that's waiting
      if (asyncEndTimes.has(depId)) {
        const asyncEnd = asyncEndTimes.get(depId)!
        if (asyncEnd > currentTime) {
          // Need to wait for async to complete
          canSchedule = false
          waitingOnAsync = true
          earliestStart = new Date(Math.max(earliestStart.getTime(), asyncEnd.getTime()))
        }
      } else {
        // Dependency not complete and not async
        canSchedule = false
        missingDeps.push(depId)
      }
    }
  }

  return {
    canSchedule,
    earliestStart: canSchedule ? undefined : earliestStart,
    waitingOnAsync,
    missingDependencies: missingDeps.length > 0 ? missingDeps : undefined,
  }
}

/**
 * Create an async wait schedule item
 */
export interface AsyncWaitItem {
  id: string
  name: string
  type: 'async-wait'
  startTime: Date
  endTime: Date
  duration: number
  priority: number
  originalItem: any
}

export function createAsyncWaitItem(
  item: WorkItem,
  startTime: Date,
  asyncWaitTime: number,
): AsyncWaitItem {
  const endTime = new Date(startTime.getTime() + asyncWaitTime * 60000)

  return {
    id: `${item.id}-wait`,
    name: `⏳ Waiting: ${item.name}`,
    type: 'async-wait',
    startTime,
    endTime,
    duration: asyncWaitTime,
    priority: item.priority,
    originalItem: item.originalItem,
  }
}

/**
 * Sort items by scheduling priority
 * Used after topological sort to optimize within dependency constraints
 */
export function sortBySchedulingPriority(items: WorkItem[], criticalPaths?: Map<string, number>): WorkItem[] {
  return items.sort((a, b) => {
    // 1. Urgent deadlines first
    if (a.deadline && b.deadline) {
      const timeDiff = a.deadline.getTime() - b.deadline.getTime()
      if (Math.abs(timeDiff) > 24 * 60 * 60 * 1000) { // More than 1 day difference
        return timeDiff
      }
    } else if (a.deadline && !b.deadline) {
      return -1
    } else if (!a.deadline && b.deadline) {
      return 1
    }

    // 2. Async triggers next (to maximize parallelization)
    if (a.isAsyncTrigger && !b.isAsyncTrigger) return -1
    if (!a.isAsyncTrigger && b.isAsyncTrigger) return 1

    // 3. Critical path (if provided)
    if (criticalPaths) {
      const aCritical = criticalPaths.get(a.id) || a.duration
      const bCritical = criticalPaths.get(b.id) || b.duration
      const pathDiff = bCritical - aCritical
      if (pathDiff !== 0) return pathDiff
    }

    // 4. Priority
    return b.priority - a.priority
  })
}
