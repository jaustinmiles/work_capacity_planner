/**
 * Utilities for managing stable step IDs across workflow updates
 */

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

  // Build name to ID mapping
  steps.forEach(step => {
    nameToId.set(step.name, step.id)
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
        console.warn(`Dependency ID "${dep}" not found, attempting to resolve by name`)
      }

      // Try to resolve by name
      const id = nameToId.get(dep)
      if (id) {
        return id
      }

      console.warn(`Could not resolve dependency "${dep}" to an ID`)
      // Return the original value as fallback
      return dep
    }),
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
  return newSteps.map((step, index) => {
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
        console.warn(`Removing invalid dependency "${depId}" from step "${step.name}"`)
      }
      return isValid
    }),
  }))
}
