/**
 * Endeavor dependency injection — makes cross-workflow hard blocks a
 * first-class scheduler input.
 *
 * EndeavorDependency rows ("step X of workflow A blocks workflow/step B",
 * isHardBlock = true) historically never reached the engine — the schema
 * contract "isHardBlock: true = blocks scheduler" was only honored by the
 * endeavor graph's next-step button (next-unblocked-step.ts, whose predicate
 * this module ports). This function rewrites the blocked items' dependency
 * lists so the wavefront allocator orders and gates them like any other edge.
 *
 * Pure module: no I/O.
 */

import type { UnifiedScheduleItem } from '../unified-scheduler'
import { StepStatus } from '../enums'

/**
 * Minimal structural shape of an endeavor dependency, satisfiable by both
 * server Prisma rows and the renderer's EndeavorDependencyWithNames.
 */
export interface EndeavorDependencyEdge {
  blockedTaskId?: string | null
  blockedStepId?: string | null
  blockingStepId: string
  blockingTaskId: string
  isHardBlock: boolean
  /** When provided, Completed/Skipped blocking steps do not block */
  blockingStepStatus?: string | null
  /** Display name for unresolved-blocker reasons */
  blockingStepName?: string | null
}

export interface EndeavorInjectionResult {
  /** Items with hard-block edges appended to their dependency lists */
  items: UnifiedScheduleItem[]
  /**
   * Items blocked by a blocker that is neither loaded nor known-completed.
   * The allocator should keep these unscheduled with the given reason.
   */
  preBlocked: Map<string, string>
}

function isSatisfiedStatus(status: string | null | undefined): boolean {
  return status === StepStatus.Completed || status === StepStatus.Skipped
}

/**
 * Append hard endeavor-dependency edges to the affected items.
 *
 * - `blockedStepId` set → that step gains the edge.
 * - Only `blockedTaskId` set → the standalone task with that id, or every
 *   step of the workflow with that id, gains the edge (a blocked workflow
 *   cannot proceed at all).
 * - Blockers already completed (via status or `completedItemIds`) are ignored.
 * - Blockers that cannot be resolved to a loaded or completed item make the
 *   blocked items `preBlocked` — conservatively unschedulable, never silently
 *   ignored (hard blocks must not be "healed" away).
 */
export function applyEndeavorDependencies(
  items: UnifiedScheduleItem[],
  completedItemIds: Set<string>,
  edges: EndeavorDependencyEdge[],
): EndeavorInjectionResult {
  const hardEdges = edges.filter((edge) => edge.isHardBlock)
  if (hardEdges.length === 0) {
    return { items, preBlocked: new Map() }
  }

  const byId = new Map(items.map((item) => [item.id, item]))
  const extraDeps = new Map<string, Set<string>>()
  const preBlocked = new Map<string, string>()

  const addEdge = (targetId: string, blockerId: string): void => {
    if (targetId === blockerId) return
    let set = extraDeps.get(targetId)
    if (!set) {
      set = new Set()
      extraDeps.set(targetId, set)
    }
    set.add(blockerId)
  }

  for (const edge of hardEdges) {
    if (isSatisfiedStatus(edge.blockingStepStatus)) {
      continue
    }

    // Resolve the targets: a specific step, a standalone task, or a whole workflow
    const targetIds: string[] = []
    if (edge.blockedStepId && byId.has(edge.blockedStepId)) {
      targetIds.push(edge.blockedStepId)
    } else if (edge.blockedTaskId) {
      if (byId.has(edge.blockedTaskId)) {
        targetIds.push(edge.blockedTaskId)
      }
      for (const item of items) {
        if (item.workflowId === edge.blockedTaskId) {
          targetIds.push(item.id)
        }
      }
    }
    if (targetIds.length === 0) {
      continue // Blocked entity is not part of this scheduling run
    }

    // Resolve the blocker to something the allocator can gate on
    const blockerId = [edge.blockingStepId, edge.blockingTaskId].find(
      (id) => byId.has(id) || completedItemIds.has(id),
    )

    if (blockerId) {
      for (const targetId of targetIds) {
        addEdge(targetId, blockerId)
      }
    } else {
      const label = edge.blockingStepName || edge.blockingStepId
      for (const targetId of targetIds) {
        if (!preBlocked.has(targetId)) {
          preBlocked.set(targetId, `Blocked by endeavor dependency: ${label}`)
        }
      }
    }
  }

  if (extraDeps.size === 0 && preBlocked.size === 0) {
    return { items, preBlocked }
  }

  const augmented = items.map((item) => {
    const extras = extraDeps.get(item.id)
    if (!extras || extras.size === 0) {
      return item
    }
    const merged = new Set([...(item.dependencies || []), ...extras])
    return { ...item, dependencies: [...merged] }
  })

  return { items: augmented, preBlocked }
}
