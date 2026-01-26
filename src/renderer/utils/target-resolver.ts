/**
 * Target Resolution Utilities
 * Resolves amendment target names to database IDs using exact matching
 * Extracted from amendment-applicator.ts for better separation of concerns
 *
 * IMPORTANT: We use EXACT matching only (case-insensitive, trimmed).
 * No fuzzy/partial matching - if the AI provides wrong names, it's a validation error.
 */

import { Amendment, AmendmentResolutionResult, EntityType, WorkflowCreation } from '@shared/amendment-types'
import { AmendmentType } from '@shared/enums'
import { logger } from '@/logger'
import { getDatabase } from '../services/database'

/**
 * Result type for findByName that includes optional step information
 */
export interface FindResult {
  id: string
  type: EntityType
  /** Set when we found a step inside a workflow - contains the actual step name */
  stepName?: string
}

/**
 * Loaded entity data for target resolution
 */
export interface EntityData {
  allTasks: Array<{ id: string; name: string }>
  allWorkflows: Array<{ id: string; name: string; steps?: Array<{ id: string; name: string }> }>
}

/**
 * Result type for dependency name resolution
 */
export interface DependencyResolutionResult {
  resolved: string[]
  unresolved: string[]
}

/**
 * Find a task, workflow, or step by name using EXACT matching (case-insensitive).
 *
 * @param name - The name to search for (exact match after normalization)
 * @param type - Optional entity type to restrict search
 * @param entityData - Pre-loaded task and workflow data
 * @returns FindResult if found, null otherwise
 */
export function findEntityByName(
  name: string,
  type: EntityType | undefined,
  entityData: EntityData,
): FindResult | null {
  const { allTasks, allWorkflows } = entityData

  // Normalize for comparison - EXACT match only (case-insensitive, trimmed)
  const normalizedName = name.toLowerCase().trim()

  // Helper for exact matching
  const exactMatch = (entityName: string) => entityName.toLowerCase().trim() === normalizedName

  // SPECIAL HANDLING: When looking for a "step", search workflow steps first
  if (type === EntityType.Step) {
    for (const workflow of allWorkflows) {
      if (workflow.steps) {
        const step = workflow.steps.find(s => exactMatch(s.name))
        if (step) {
          logger.ui.info('Found step in workflow', {
            stepName: step.name,
            workflowName: workflow.name,
            workflowId: workflow.id,
          }, 'step-found-in-workflow')
          // Return workflow ID - the handlers need the workflow to find the step
          return {
            id: workflow.id,
            type: EntityType.Workflow,
            stepName: step.name,  // Pass actual step name for use in handlers
          }
        }
      }
    }
    // Not found as step - try as a standalone task (AI may have misclassified)
    const task = allTasks.find(t => exactMatch(t.name))
    if (task) {
      logger.ui.info('Correcting target type from step to task', {
        name,
        foundType: 'task',
      }, 'type-corrected')
      return { id: task.id, type: EntityType.Task }
    }
    // Still not found - return null
    return null
  }

  // If type is specified, search only that type
  if (type === EntityType.Task) {
    const task = allTasks.find(t => exactMatch(t.name))
    if (task) return { id: task.id, type: EntityType.Task }
  } else if (type === EntityType.Workflow) {
    const workflow = allWorkflows.find(w => exactMatch(w.name))
    if (workflow) return { id: workflow.id, type: EntityType.Workflow }
  } else {
    // Search both types - workflows first (more specific)
    const workflow = allWorkflows.find(w => exactMatch(w.name))
    if (workflow) return { id: workflow.id, type: EntityType.Workflow }

    const task = allTasks.find(t => exactMatch(t.name))
    if (task) return { id: task.id, type: EntityType.Task }
  }

  return null
}

/**
 * Resolve dependency names to IDs using exact matching.
 * Handles both task names and workflow step names.
 *
 * Names that don't match any entity are passed through unchanged -
 * they may be existing IDs that should be validated by the caller.
 *
 * @param dependencyNames - Array of dependency names/IDs to resolve
 * @param entityData - Pre-loaded task and workflow data
 * @returns Object with resolved IDs and unresolved names
 */
export function resolveDependencyNames(
  dependencyNames: string[],
  entityData: EntityData,
): DependencyResolutionResult {
  const resolved: string[] = []
  const unresolved: string[] = []

  for (const name of dependencyNames) {
    // Try to find entity by exact name match
    const match = findEntityByName(name, undefined, entityData)
    if (match) {
      resolved.push(match.id)
      logger.ui.info('Resolved dependency name to ID', {
        name,
        resolvedId: match.id,
        type: match.type,
      }, 'dependency-resolved')
    } else {
      // Not found by name - pass through unchanged (may be an existing ID)
      // The caller should validate if this is a valid ID
      resolved.push(name)
      logger.ui.info('Dependency not found by name, passing through as-is', {
        name,
      }, 'dependency-passthrough')
    }
  }

  return { resolved, unresolved }
}

/**
 * Validates and filters step dependencies within a WorkflowCreation.
 * AI generates dependsOn arrays with step NAMES - this validates they reference valid steps.
 *
 * Mutates the creation in place by removing invalid dependencies from each step.
 *
 * @param creation - The WorkflowCreation amendment to validate
 */
function validateWorkflowStepDependencies(creation: WorkflowCreation): void {
  // Build map of valid step names within this workflow (case-insensitive)
  const validStepNames = new Set<string>()
  for (const step of creation.steps) {
    validStepNames.add(step.name.toLowerCase().trim())
  }

  // Validate dependencies for each step
  for (const step of creation.steps) {
    if (step.dependsOn && step.dependsOn.length > 0) {
      const validDeps: string[] = []
      const invalidDeps: string[] = []

      for (const depName of step.dependsOn) {
        const normalizedDep = depName.toLowerCase().trim()
        if (validStepNames.has(normalizedDep)) {
          // Keep original name (applicator will convert to IDs after step creation)
          validDeps.push(depName)
        } else {
          invalidDeps.push(depName)
        }
      }

      // Update step's dependencies to only include valid ones
      step.dependsOn = validDeps

      if (invalidDeps.length > 0) {
        logger.ui.warn('WorkflowCreation step has invalid dependencies', {
          workflowName: creation.name,
          stepName: step.name,
          invalidDeps,
          availableSteps: Array.from(validStepNames),
        }, 'workflow-deps-invalid')
      }
    }
  }

  logger.ui.info('Validated WorkflowCreation step dependencies', {
    workflowName: creation.name,
    stepCount: creation.steps.length,
    stepsWithDeps: creation.steps.filter(s => s.dependsOn && s.dependsOn.length > 0).length,
  }, 'workflow-deps-validated')
}

/**
 * Check if an amendment requires a target to be resolved.
 * Some amendments (like TaskCreation, WorkflowCreation) don't need target resolution.
 */
function amendmentRequiresTarget(amendment: Amendment): boolean {
  // These amendment types create new entities, they don't need existing targets
  const creationTypes = [
    AmendmentType.TaskCreation,
    AmendmentType.WorkflowCreation,
    AmendmentType.TaskTypeCreation,
    AmendmentType.QueryResponse,
  ]
  return !creationTypes.includes(amendment.type)
}

/**
 * Check if an amendment requires a workflow target (for step operations).
 */
function amendmentRequiresWorkflowTarget(amendment: Amendment): boolean {
  return amendment.type === AmendmentType.StepAddition ||
         amendment.type === AmendmentType.StepRemoval
}

/**
 * Resolve target names to IDs by looking up tasks and workflows in the database.
 * This is critical because the AI generates amendments with names but no IDs.
 *
 * Mutates the amendments array in place by setting target.id, workflowTarget.id,
 * and resolving dependency arrays (addDependencies, removeDependencies, etc.)
 *
 * Returns resolution results for each amendment indicating success or failure.
 * This enables fail-fast behavior in the applicator.
 *
 * @param amendments - Array of amendments to resolve targets for
 * @param db - Database instance (optional, will use getDatabase() if not provided)
 * @returns Array of resolution results, one per amendment
 */
export async function resolveAmendmentTargets(
  amendments: Amendment[],
  db?: ReturnType<typeof getDatabase>,
): Promise<AmendmentResolutionResult[]> {
  const database = db || getDatabase()
  const results: AmendmentResolutionResult[] = []

  // Load all tasks and workflows once
  const allTasks = await database.getTasks()
  const allWorkflows = await database.getSequencedTasks()

  const entityData: EntityData = { allTasks, allWorkflows }

  // Process each amendment and resolve targets
  for (const amendment of amendments) {
    let resolved = true
    let error: string | undefined

    // Handle amendments with 'target' field
    if ('target' in amendment && amendment.target && !amendment.target.id) {
      const match = findEntityByName(amendment.target.name, amendment.target.type as EntityType, entityData)
      if (match) {
        amendment.target.id = match.id
        amendment.target.type = match.type
        logger.ui.info('Resolved amendment target', {
          name: amendment.target.name,
          id: match.id,
          type: match.type,
          stepName: match.stepName,
        }, 'target-resolved')

        // If we found a step inside a workflow, propagate stepName to amendments that need it
        // This handles the case where AI sends target.type: "step" for workflow steps
        if (match.stepName) {
          // Set stepName on amendments that use it for step-specific operations
          if ('stepName' in amendment && !amendment.stepName) {
            (amendment as { stepName?: string }).stepName = match.stepName
            logger.ui.info('Set stepName from resolved step', {
              amendmentType: amendment.type,
              stepName: match.stepName,
            }, 'stepname-propagated')
          }
        }
      } else if (amendmentRequiresTarget(amendment)) {
        // Only mark as failed if this amendment type actually needs a target
        resolved = false
        error = `Target "${amendment.target.name}" not found in database`
        logger.ui.warn('Could not resolve amendment target', {
          name: amendment.target.name,
          type: amendment.target.type,
          availableTasks: allTasks.map(t => t.name).slice(0, 5),
          availableWorkflows: allWorkflows.map(w => w.name).slice(0, 5),
        }, 'target-not-found')
      }
    }

    // Handle amendments with 'workflowTarget' field (StepAddition, StepRemoval)
    if ('workflowTarget' in amendment && amendment.workflowTarget && !amendment.workflowTarget.id) {
      const match = findEntityByName(amendment.workflowTarget.name, EntityType.Workflow, entityData)
      if (match) {
        amendment.workflowTarget.id = match.id
        logger.ui.info('Resolved workflow target', {
          name: amendment.workflowTarget.name,
          id: match.id,
        }, 'workflow-target-resolved')
      } else if (amendmentRequiresWorkflowTarget(amendment)) {
        // Only mark as failed if this amendment type actually needs a workflow target
        resolved = false
        error = `Workflow "${amendment.workflowTarget.name}" not found in database`
        logger.ui.warn('Could not resolve workflow target', {
          name: amendment.workflowTarget.name,
          availableWorkflows: allWorkflows.map(w => w.name).slice(0, 5),
        }, 'workflow-target-not-found')
      }
    }

    // Handle DependencyChange amendments - resolve dependency arrays
    if ('addDependencies' in amendment && amendment.addDependencies && amendment.addDependencies.length > 0) {
      const result = resolveDependencyNames(amendment.addDependencies, entityData)
      amendment.addDependencies = result.resolved
      if (result.unresolved.length > 0) {
        logger.ui.warn('Some addDependencies could not be resolved', {
          unresolved: result.unresolved,
          amendmentType: amendment.type,
        }, 'dependency-resolution-partial')
      }
    }

    if ('removeDependencies' in amendment && amendment.removeDependencies && amendment.removeDependencies.length > 0) {
      const result = resolveDependencyNames(amendment.removeDependencies, entityData)
      amendment.removeDependencies = result.resolved
      if (result.unresolved.length > 0) {
        logger.ui.warn('Some removeDependencies could not be resolved', {
          unresolved: result.unresolved,
          amendmentType: amendment.type,
        }, 'dependency-resolution-partial')
      }
    }

    if ('addDependents' in amendment && amendment.addDependents && amendment.addDependents.length > 0) {
      const result = resolveDependencyNames(amendment.addDependents, entityData)
      amendment.addDependents = result.resolved
      if (result.unresolved.length > 0) {
        logger.ui.warn('Some addDependents could not be resolved', {
          unresolved: result.unresolved,
          amendmentType: amendment.type,
        }, 'dependency-resolution-partial')
      }
    }

    if ('removeDependents' in amendment && amendment.removeDependents && amendment.removeDependents.length > 0) {
      const result = resolveDependencyNames(amendment.removeDependents, entityData)
      amendment.removeDependents = result.resolved
      if (result.unresolved.length > 0) {
        logger.ui.warn('Some removeDependents could not be resolved', {
          unresolved: result.unresolved,
          amendmentType: amendment.type,
        }, 'dependency-resolution-partial')
      }
    }

    // Handle StepAddition amendments - resolve dependencies array
    if ('dependencies' in amendment && amendment.dependencies && amendment.dependencies.length > 0) {
      const result = resolveDependencyNames(amendment.dependencies, entityData)
      amendment.dependencies = result.resolved
      if (result.unresolved.length > 0) {
        logger.ui.warn('Some step dependencies could not be resolved', {
          unresolved: result.unresolved,
          amendmentType: amendment.type,
        }, 'dependency-resolution-partial')
      }
    }

    // Handle WorkflowCreation - validate step dependencies within the workflow
    if (amendment.type === AmendmentType.WorkflowCreation) {
      validateWorkflowStepDependencies(amendment as WorkflowCreation)
    }

    // Add result for this amendment
    results.push({
      amendment,
      resolved,
      error,
    })
  }

  return results
}
