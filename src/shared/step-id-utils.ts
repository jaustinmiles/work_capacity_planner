/**
 * Utilities for managing stable IDs across the application
 *
 * This file provides consistent ID generation for:
 * - Workflow steps (deterministic and random)
 * - Service instances (for tracking and debugging)
 * - Log deduplication (composite keys)
 * - General unique IDs (jargon entries, sessions, etc.)
 */
import { logger } from '../logger'

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
  return generateUniqueId('step')
}

/**
 * Generate a unique ID with a given prefix
 * Format: prefix-timestamp-random
 * Example: "WTS-1759443199835-3ejbx2mvh"
 *
 * Uses cryptographically secure random number generation
 *
 * @param prefix - The prefix to use for the ID (e.g., 'WTS', 'jargon', 'session')
 * @returns A unique ID string
 */
export function generateUniqueId(prefix: string): string {
  const timestamp = Date.now().toString(36)

  // Use crypto.randomUUID() if available (browser/Node 15+), fallback to crypto.getRandomValues
  let random: string
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // Use randomUUID and extract a portion for compact IDs
    random = crypto.randomUUID().replace(/-/g, '').substring(0, 9)
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Fallback: use getRandomValues
    const array = new Uint32Array(2)
    crypto.getRandomValues(array)
    random = (array[0] ?? 0).toString(36) + (array[1] ?? 0).toString(36).substring(0, 5)
  } else {
    // Final fallback for test environments without crypto (should not happen in production)
    random = Math.random().toString(36).substring(2, 11)
  }

  return `${prefix}-${timestamp}-${random}`
}

/**
 * Generate a composite log ID for deduplication
 * Format: timestamp-message-level
 * Example: "2025-10-02T22:13:19.875Z-Main process initialized-INFO"
 *
 * Used by IPCTransport to prevent sending duplicate logs between processes
 *
 * @param timestamp - ISO timestamp of the log entry
 * @param message - The log message
 * @param level - The log level (e.g., INFO, DEBUG, ERROR)
 * @returns A composite ID string for deduplication
 */
export function generateLogId(timestamp: string, message: string, level: string | number): string {
  return `${timestamp}-${message}-${level}`
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
      if (stepNumberMatch && stepNumberMatch[1]) {
        const stepIndex = parseInt(stepNumberMatch[1], 10) - 1 // Convert to 0-based index
        const step = steps[stepIndex]
        if (stepIndex >= 0 && step) {
          return step.id
        }
      }

      // Try to find if this is a reference like "Workflow Name step N"
      // where the workflow name is prepended to "step N"
      const workflowStepMatch = dep.match(/^(.+?)\s+step\s+(\d+)$/i)
      if (workflowStepMatch && workflowStepMatch[2]) {
        const stepIndex = parseInt(workflowStepMatch[2], 10) - 1
        const step = steps[stepIndex]
        if (stepIndex >= 0 && step) {
          return step.id
        }
      }

      // Try partial match as last resort - check if any step name is contained in the dependency
      for (const [stepName, stepId] of Array.from(nameToId.entries())) {
        if (dep.includes(stepName) || stepName.includes(dep)) {
          return stepId
        }
      }

      logger.system.warn(`Could not resolve dependency "${dep}" to an ID`, {
        dependency: dep,
      }, 'dependency-resolve-error')
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
 * Resolve step dependencies from names/mixed references to valid step IDs.
 *
 * Used by server routers during workflow creation to ensure dependsOn
 * always contains step IDs, never step names. This is the authoritative
 * resolution point — called in task.create, workflow.addStep, etc.
 *
 * Resolution strategy per entry in dependsOn:
 * 1. If it matches a step ID in the set → keep it
 * 2. If it matches a step name (exact, case-insensitive, partial) → resolve to ID
 * 3. If it matches "step N" or "Step N" → resolve by index
 * 4. Otherwise → drop it with a warning
 *
 * @param steps - All steps being created, each must have id, name, and dependsOn
 * @returns Same steps with dependsOn resolved to valid IDs
 */
export function resolveStepDependencies<T extends { id: string; name: string; dependsOn: string[] }>(
  steps: T[],
): T[] {
  const idSet = new Set(steps.map(s => s.id))
  const nameToId = new Map<string, string>()

  // Build lookup maps
  for (const step of steps) {
    nameToId.set(step.name, step.id)
    nameToId.set(step.name.toLowerCase(), step.id)
  }

  return steps.map(step => ({
    ...step,
    dependsOn: step.dependsOn
      .map(dep => resolveOneDependency(dep, idSet, nameToId, steps))
      .filter((id): id is string => id !== null),
  }))
}

/**
 * Resolve dependencies against a set of existing steps.
 *
 * Used by addStep and updateStep where the new step's dependencies
 * reference siblings that already exist in the database.
 *
 * @param dependsOn - The dependency references to resolve (names, IDs, or mixed)
 * @param existingSteps - The existing sibling steps (with id and name)
 * @returns Array of resolved step IDs (unresolvable entries dropped)
 */
export function resolveDependenciesAgainstExisting(
  dependsOn: string[],
  existingSteps: Array<{ id: string; name: string }>,
): string[] {
  const idSet = new Set(existingSteps.map(s => s.id))
  const nameToId = new Map<string, string>()

  for (const step of existingSteps) {
    nameToId.set(step.name, step.id)
    nameToId.set(step.name.toLowerCase(), step.id)
  }

  return dependsOn
    .map(dep => resolveOneDependency(dep, idSet, nameToId, existingSteps))
    .filter((id): id is string => id !== null)
}

/**
 * Resolve a single dependency reference to a step ID.
 * Shared logic used by both resolveStepDependencies and resolveDependenciesAgainstExisting.
 */
function resolveOneDependency(
  dep: string,
  validIds: Set<string>,
  nameToId: Map<string, string>,
  steps: Array<{ id: string; name: string }>,
): string | null {
  // 1. Already a valid step ID
  if (validIds.has(dep)) {
    return dep
  }

  // 2. Exact name match
  const exactMatch = nameToId.get(dep)
  if (exactMatch) return exactMatch

  // 3. Case-insensitive name match
  const ciMatch = nameToId.get(dep.toLowerCase())
  if (ciMatch) return ciMatch

  // 4. "step N" or "Step N" reference (1-based)
  const stepNumMatch = dep.match(/^(?:step|Step)\s+(\d+)$/i)
  if (stepNumMatch?.[1]) {
    const idx = parseInt(stepNumMatch[1], 10) - 1
    const matchedStep = steps[idx]
    if (idx >= 0 && matchedStep) {
      return matchedStep.id
    }
  }

  // 5. Partial match — step name contained in dep or dep contained in step name
  for (const [name, id] of nameToId.entries()) {
    if (dep.includes(name) || name.includes(dep)) {
      return id
    }
  }

  // 6. Unresolvable — drop it
  logger.system.warn(`Could not resolve dependency "${dep}" to a step ID — dropping`, {
    dependency: dep,
    availableSteps: steps.map(s => ({ id: s.id, name: s.name })),
  }, 'dependency-resolve-dropped')

  return null
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
        logger.system.warn(`Removing invalid dependency "${depId}" from step "${step.name}"`, {
          dependencyId: depId,
          stepName: step.name,
        }, 'invalid-dependency-removed')
      }
      return isValid
    }),
  }))
}

// Re-export validateWorkflowDependencies and StepDefinition from graph-utils for backwards compatibility
// This function now lives in graph-utils.ts alongside other dependency graph algorithms
export { validateWorkflowDependencies } from './graph-utils'
export type { StepDefinition } from './graph-utils'
