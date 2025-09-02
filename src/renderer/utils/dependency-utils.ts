import { TaskStep } from '@shared/sequencing-types'
import { DependencyChange } from '@shared/amendment-types'
import { logger } from '@shared/logger'

/**
 * Utility functions for managing task dependencies across the application
 */

/**
 * Apply forward dependency changes to a step
 */
export function applyForwardDependencyChanges(
  step: TaskStep,
  change: DependencyChange,
  allSteps: TaskStep[],
): void {
  // Add new forward dependencies
  if (change.addDependencies && change.addDependencies.length > 0) {
    for (const depName of change.addDependencies) {
      // Find the step by name
      const depStep = allSteps.find(s =>
        s.name.toLowerCase() === depName.toLowerCase(),
      )
      if (depStep && !step.dependsOn.includes(depStep.id)) {
        step.dependsOn.push(depStep.id)
        logger.ui.info('Added forward dependency', {
          step: step.name,
          dependsOn: depName,
        })
      }
    }
  }

  // Remove forward dependencies
  if (change.removeDependencies && change.removeDependencies.length > 0) {
    for (const depName of change.removeDependencies) {
      const depStep = allSteps.find(s =>
        s.name.toLowerCase() === depName.toLowerCase(),
      )
      if (depStep) {
        step.dependsOn = step.dependsOn.filter(id => id !== depStep.id)
        logger.ui.info('Removed forward dependency', {
          step: step.name,
          removed: depName,
        })
      }
    }
  }
}

/**
 * Apply reverse dependency changes (update other steps to depend on this one)
 */
export function applyReverseDependencyChanges(
  targetStep: TaskStep,
  change: DependencyChange,
  allSteps: TaskStep[],
): void {
  // Add reverse dependencies (make other steps depend on this one)
  if (change.addDependents && change.addDependents.length > 0) {
    for (const dependentName of change.addDependents) {
      const dependentStep = allSteps.find(s =>
        s.name.toLowerCase() === dependentName.toLowerCase(),
      )
      if (dependentStep && !dependentStep.dependsOn.includes(targetStep.id)) {
        dependentStep.dependsOn.push(targetStep.id)
        logger.ui.info('Added reverse dependency', {
          dependent: dependentName,
          dependsOn: targetStep.name,
        })
      }
    }
  }

  // Remove reverse dependencies
  if (change.removeDependents && change.removeDependents.length > 0) {
    for (const dependentName of change.removeDependents) {
      const dependentStep = allSteps.find(s =>
        s.name.toLowerCase() === dependentName.toLowerCase(),
      )
      if (dependentStep) {
        dependentStep.dependsOn = dependentStep.dependsOn.filter(
          id => id !== targetStep.id,
        )
        logger.ui.info('Removed reverse dependency', {
          dependent: dependentName,
          noDependsOn: targetStep.name,
        })
      }
    }
  }
}

/**
 * Convert dependency IDs to names for display
 */
export function getDependencyNames(
  dependencyIds: string[],
  allSteps: Array<{ id: string; name: string }>,
): string[] {
  return dependencyIds.map(id => {
    const step = allSteps.find(s => s.id === id)
    return step?.name || id
  })
}

/**
 * Convert dependency names to IDs
 */
export function getDependencyIds(
  dependencyNames: string[],
  allSteps: Array<{ id: string; name: string }>,
): string[] {
  return dependencyNames
    .map(name => {
      const step = allSteps.find(s =>
        s.name.toLowerCase() === name.toLowerCase(),
      )
      return step?.id
    })
    .filter((id): id is string => id !== undefined)
}

/**
 * Check if adding a dependency would create a circular reference
 */
export function wouldCreateCircularDependency(
  fromStepId: string,
  toStepId: string,
  allSteps: TaskStep[],
): boolean {
  // Can't depend on self
  if (fromStepId === toStepId) return true

  // Check if toStep already depends on fromStep (directly or indirectly)
  const visited = new Set<string>()
  const queue = [toStepId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || visited.has(currentId)) continue
    visited.add(currentId)

    const currentStep = allSteps.find(s => s.id === currentId)
    if (!currentStep) continue

    // If we reach the fromStep, it would create a circle
    if (currentStep.dependsOn.includes(fromStepId)) {
      return true
    }

    // Add this step's dependencies to check
    queue.push(...currentStep.dependsOn)
  }

  return false
}

/**
 * Get all steps that depend on a given step (reverse dependencies)
 */
export function getReverseDependencies(
  stepId: string,
  allSteps: TaskStep[],
): string[] {
  return allSteps
    .filter(step => step.dependsOn.includes(stepId))
    .map(step => step.id)
}

/**
 * Transform amendment dependency changes to direct dependency arrays
 * Used to convert between amendment format and direct state format
 */
export function amendmentToDirectDependencies(
  amendment: DependencyChange,
  currentDependencies: string[],
  allSteps: Array<{ id: string; name: string }>,
): {
  forward: string[]
  reverse: string[]
} {
  // Calculate forward dependencies
  let forward = [...currentDependencies]

  if (amendment.addDependencies) {
    const toAdd = getDependencyIds(amendment.addDependencies, allSteps)
    forward = [...new Set([...forward, ...toAdd])]
  }

  if (amendment.removeDependencies) {
    const toRemove = getDependencyIds(amendment.removeDependencies, allSteps)
    forward = forward.filter(id => !toRemove.includes(id))
  }

  // Calculate reverse dependencies (these would be applied to other steps)
  const reverse: string[] = []
  if (amendment.addDependents) {
    reverse.push(...getDependencyIds(amendment.addDependents, allSteps))
  }

  return { forward, reverse }
}

/**
 * Convert direct dependency changes back to amendment format
 * Used when saving changes from the DependencyEditor
 */
export function directToAmendmentDependencies(
  newForward: string[],
  oldForward: string[],
  newReverse: string[],
  oldReverse: string[],
  allSteps: Array<{ id: string; name: string }>,
): Partial<DependencyChange> {
  const addDependencies = getDependencyNames(
    newForward.filter(id => !oldForward.includes(id)),
    allSteps,
  )

  const removeDependencies = getDependencyNames(
    oldForward.filter(id => !newForward.includes(id)),
    allSteps,
  )

  const addDependents = getDependencyNames(
    newReverse.filter(id => !oldReverse.includes(id)),
    allSteps,
  )

  const removeDependents = getDependencyNames(
    oldReverse.filter(id => !newReverse.includes(id)),
    allSteps,
  )

  // Return empty arrays instead of undefined for consistency
  // This makes it easier to iterate over results without null checks
  return {
    addDependencies,
    removeDependencies,
    addDependents,
    removeDependents,
  }
}
