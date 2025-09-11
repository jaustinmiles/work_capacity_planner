/**
 * Utilities for managing stable step IDs across workflow updates
 */
import { logger } from './logger'

/**
 * Generate a stable step ID that won't change between updates
 * Uses workflow name and step name to create a deterministic ID
 */
export function generateStableStepId(workflowName: string, stepName: string, stepIndex: number): string {
  // Create a deterministic hash from workflow and step names
  const baseString = `${workflowName}-${stepName}-${stepIndex}`
  const hash = simpleHash(baseString)
  return `step-${hash}`
}

/**
 * Simple hash function for creating deterministic IDs
 * Not cryptographically secure, but good enough for our use case
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Generate a truly random step ID for new steps
 * Used when we need to ensure uniqueness
 */
export function generateRandomStepId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 9)
  return `step-${timestamp}-${random}`
}

/**
 * Map step dependencies from names to IDs
 * Generic version that preserves all original fields
 */
export function mapDependenciesToIds<T extends { name: string; id: string; dependsOn?: string[] }>(
  steps: T[],
): Array<T & { dependsOn: string[] }> {
  const nameToId = new Map<string, string>()
  const nameToIndex = new Map<string, number>()

  // Build name to ID mapping
  steps.forEach((step, index) => {
    nameToId.set(step.name, step.id)
    nameToId.set(step.name.toLowerCase(), step.id) // Case-insensitive fallback
    nameToIndex.set(step.name, index)
  })

  // Map dependencies
  return steps.map(step => ({
    ...step,
    dependsOn: (step.dependsOn || []).map(dep => {
      // If it's already an ID format, keep it
      if (dep.startsWith('step-')) {
        // Check if this ID actually exists in our steps
        const exists = steps.some(s => s.id === dep)
        if (exists) {
          return dep
        }
        // If not, try to find by name
        logger.scheduler.warn(`Dependency ID "${dep}" not found, attempting to resolve by name`)
      }

      // Try exact name match
      let id = nameToId.get(dep)
      if (id) {
        return id
      }

      // Try case-insensitive match
      id = nameToId.get(dep.toLowerCase())
      if (id) {
        return id
      }

      // Try to parse "step N" or "Step N" references
      const stepNumberMatch = dep.match(/^(?:step|Step)\s+(\d+)$/i)
      if (stepNumberMatch) {
        const stepIndex = parseInt(stepNumberMatch[1], 10) - 1 // Convert to 0-based index
        if (stepIndex >= 0 && stepIndex < steps.length) {
          return steps[stepIndex].id
        }
      }

      // Try to find if this is a reference like "Workflow Name step N"
      // where the workflow name is prepended to "step N"
      const workflowStepMatch = dep.match(/^(.+?)\s+step\s+(\d+)$/i)
      if (workflowStepMatch) {
        const stepIndex = parseInt(workflowStepMatch[2], 10) - 1
        if (stepIndex >= 0 && stepIndex < steps.length) {
          return steps[stepIndex].id
        }
      }

      // Try partial match as last resort - check if any step name is contained in the dependency
      for (const [stepName, stepId] of nameToId.entries()) {
        if (dep.includes(stepName) || stepName.includes(dep)) {
          logger.scheduler.warn(`Fuzzy matching dependency "${dep}" to step "${stepName}"`)
          return stepId
        }
      }

      logger.scheduler.warn(`Could not resolve dependency "${dep}" to an ID`)
      // Return empty array to prevent blocking - dependencies will be ignored
      return null
    }).filter(id => id !== null) as string[],
  }))
}

/**
 * Preserve existing step IDs when updating a workflow
 * This ensures dependencies remain valid across updates
 */
export function preserveStepIds(
  existingSteps: Array<{ id: string; name: string }>,
  newSteps: Array<{ name: string; [key: string]: any }>,
): Array<{ id: string; name: string; [key: string]: any }> {
  const existingIdMap = new Map<string, string>()

  // Build map of existing step names to IDs
  existingSteps.forEach(step => {
    existingIdMap.set(step.name, step.id)
  })

  // Assign IDs to new steps
  return newSteps.map((step) => {
    // Try to find existing ID by name match
    const existingId = existingIdMap.get(step.name)

    if (existingId) {
      // Preserve existing ID
      return {
        ...step,
        id: existingId,
      }
    } else {
      // Generate new ID for truly new step
      return {
        ...step,
        id: generateRandomStepId(),
      }
    }
  })
}

/**
 * Validate that all dependencies reference valid step IDs
 */
export function validateDependencies(
  steps: Array<{ id: string; name: string; dependsOn: string[] }>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const validIds = new Set(steps.map(s => s.id))

  steps.forEach(step => {
    step.dependsOn.forEach(depId => {
      if (!validIds.has(depId)) {
        errors.push(`Step "${step.name}" has invalid dependency "${depId}"`)
      }
    })
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Fix broken dependencies by removing invalid references
 */
export function fixBrokenDependencies(
  steps: Array<{ id: string; name: string; dependsOn: string[] }>,
): Array<{ id: string; name: string; dependsOn: string[] }> {
  const validIds = new Set(steps.map(s => s.id))

  return steps.map(step => ({
    ...step,
    dependsOn: step.dependsOn.filter(depId => {
      const isValid = validIds.has(depId)
      if (!isValid) {
        logger.scheduler.warn(`Removing invalid dependency "${depId}" from step "${step.name}"`)
      }
      return isValid
    }),
  }))
}
