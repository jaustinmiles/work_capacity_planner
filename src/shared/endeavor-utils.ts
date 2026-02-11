/**
 * Endeavor Utilities
 *
 * Utilities for working with endeavors, including progress calculation
 * and cross-endeavor dependency detection.
 */

import { EndeavorStatus, TaskStatus, StepStatus } from './enums'
import type { Task, EndeavorWithTasks, EndeavorProgress, Endeavor } from './types'

/**
 * Cross-endeavor dependency information
 * Describes when a task depends on tasks from other endeavors
 */
export interface CrossEndeavorDependency {
  /** The dependency task ID */
  dependencyId: string
  /** The dependency task name */
  dependencyName: string
  /** The endeavor the dependency belongs to */
  endeavorId: string
  /** The endeavor name */
  endeavorName: string
  /** Whether the dependency is completed */
  isCompleted: boolean
}

/**
 * Get cross-endeavor dependencies for a task
 *
 * Identifies when a task's dependencies come from different endeavors,
 * which is important for planning and visualizing cross-project blockers.
 *
 * @param task - The task to check dependencies for
 * @param currentEndeavor - The endeavor the task belongs to
 * @param allEndeavors - All endeavors to search for dependencies
 * @returns Array of cross-endeavor dependency info
 */
export function getCrossEndeavorDependencies(
  task: Task,
  currentEndeavor: EndeavorWithTasks,
  allEndeavors: EndeavorWithTasks[],
): CrossEndeavorDependency[] {
  if (!task.dependencies || task.dependencies.length === 0) {
    return []
  }

  // Build a map of task ID to endeavor for quick lookup
  const taskToEndeavor = new Map<string, { endeavor: EndeavorWithTasks; task: Task }>()

  for (const endeavor of allEndeavors) {
    for (const item of endeavor.items) {
      taskToEndeavor.set(item.taskId, { endeavor, task: item.task })
    }
  }

  // Find dependencies that belong to other endeavors
  const crossDeps: CrossEndeavorDependency[] = []

  for (const depId of task.dependencies) {
    const depInfo = taskToEndeavor.get(depId)

    // Skip if dependency is in the same endeavor or not found in any endeavor
    if (!depInfo || depInfo.endeavor.id === currentEndeavor.id) {
      continue
    }

    crossDeps.push({
      dependencyId: depId,
      dependencyName: depInfo.task.name,
      endeavorId: depInfo.endeavor.id,
      endeavorName: depInfo.endeavor.name,
      isCompleted: depInfo.task.completed,
    })
  }

  return crossDeps
}

/**
 * Calculate progress for an endeavor based on its tasks
 *
 * Considers both simple tasks and workflow tasks (with steps).
 * Progress is calculated both by task count and by duration.
 *
 * @param endeavor - The endeavor with populated tasks
 * @returns Progress metrics
 */
export function calculateEndeavorProgress(endeavor: EndeavorWithTasks): EndeavorProgress {
  if (endeavor.items.length === 0) {
    return {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      totalDuration: 0,
      completedDuration: 0,
      percentComplete: 0,
    }
  }

  let totalTasks = 0
  let completedTasks = 0
  let inProgressTasks = 0
  let totalDuration = 0
  let completedDuration = 0

  for (const item of endeavor.items) {
    const task = item.task
    totalTasks++
    totalDuration += task.duration

    if (task.completed) {
      completedTasks++
      completedDuration += task.actualDuration ?? task.duration
    } else if (task.hasSteps) {
      // For workflows, check step-level progress
      const status = task.overallStatus as TaskStatus
      if (status === TaskStatus.InProgress || status === TaskStatus.Waiting) {
        inProgressTasks++

        // Calculate partial completion based on steps
        if (task.steps && task.steps.length > 0) {
          const completedSteps = task.steps.filter(
            s => s.status === StepStatus.Completed || s.status === StepStatus.Skipped,
          )
          const stepDuration = completedSteps.reduce(
            (sum, s) => sum + (s.actualDuration ?? s.duration),
            0,
          )
          completedDuration += stepDuration
        }
      }
    } else {
      // Simple task - check status
      const status = task.overallStatus as TaskStatus
      if (status === TaskStatus.InProgress) {
        inProgressTasks++
      }
    }
  }

  const percentComplete = totalDuration > 0
    ? Math.round((completedDuration / totalDuration) * 100)
    : 0

  return {
    totalTasks,
    completedTasks,
    inProgressTasks,
    totalDuration,
    completedDuration,
    percentComplete,
  }
}

/**
 * Determine if an endeavor is blocked by cross-endeavor dependencies
 *
 * An endeavor is blocked if any of its non-completed tasks have
 * incomplete dependencies from other endeavors.
 *
 * @param endeavor - The endeavor to check
 * @param allEndeavors - All endeavors for cross-reference
 * @returns true if the endeavor is blocked
 */
export function isEndeavorBlocked(
  endeavor: EndeavorWithTasks,
  allEndeavors: EndeavorWithTasks[],
): boolean {
  for (const item of endeavor.items) {
    if (item.task.completed) continue

    const crossDeps = getCrossEndeavorDependencies(item.task, endeavor, allEndeavors)
    const hasIncomplete = crossDeps.some(dep => !dep.isCompleted)

    if (hasIncomplete) {
      return true
    }
  }

  return false
}

/**
 * Get all blocking endeavors for an endeavor
 *
 * Returns the list of endeavors that have incomplete tasks
 * that the given endeavor depends on.
 *
 * @param endeavor - The endeavor to check
 * @param allEndeavors - All endeavors for cross-reference
 * @returns Array of blocking endeavor IDs with details
 */
export function getBlockingEndeavors(
  endeavor: EndeavorWithTasks,
  allEndeavors: EndeavorWithTasks[],
): Array<{ endeavorId: string; endeavorName: string; blockingTaskCount: number }> {
  const blockingMap = new Map<string, { name: string; count: number }>()

  for (const item of endeavor.items) {
    if (item.task.completed) continue

    const crossDeps = getCrossEndeavorDependencies(item.task, endeavor, allEndeavors)

    for (const dep of crossDeps) {
      if (!dep.isCompleted) {
        const existing = blockingMap.get(dep.endeavorId)
        if (existing) {
          existing.count++
        } else {
          blockingMap.set(dep.endeavorId, { name: dep.endeavorName, count: 1 })
        }
      }
    }
  }

  return Array.from(blockingMap.entries()).map(([id, info]) => ({
    endeavorId: id,
    endeavorName: info.name,
    blockingTaskCount: info.count,
  }))
}

/**
 * Suggest an appropriate status based on endeavor progress
 *
 * @param endeavor - The endeavor with tasks
 * @returns Suggested status
 */
export function suggestEndeavorStatus(endeavor: EndeavorWithTasks): EndeavorStatus {
  const progress = calculateEndeavorProgress(endeavor)

  if (progress.totalTasks === 0) {
    return EndeavorStatus.Active
  }

  if (progress.completedTasks === progress.totalTasks) {
    return EndeavorStatus.Completed
  }

  // If currently marked as completed but has incomplete tasks, suggest active
  if (endeavor.status === EndeavorStatus.Completed && progress.completedTasks < progress.totalTasks) {
    return EndeavorStatus.Active
  }

  return endeavor.status
}

/**
 * Sort endeavors by priority (importance * urgency) and deadline
 *
 * @param endeavors - Array of endeavors to sort
 * @returns Sorted array (highest priority first)
 */
export function sortEndeavorsByPriority<T extends Endeavor>(endeavors: T[]): T[] {
  return [...endeavors].sort((a, b) => {
    // First sort by combined priority score
    const priorityA = a.importance * a.urgency
    const priorityB = b.importance * b.urgency

    if (priorityA !== priorityB) {
      return priorityB - priorityA // Higher priority first
    }

    // Then by deadline (earlier first, undefined last)
    if (a.deadline && b.deadline) {
      return a.deadline.getTime() - b.deadline.getTime()
    }
    if (a.deadline) return -1
    if (b.deadline) return 1

    // Finally by creation date (older first)
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}
