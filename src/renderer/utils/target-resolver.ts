/**
 * Target Resolution Utilities
 * Resolves amendment target names to database IDs using fuzzy matching
 * Extracted from amendment-applicator.ts for better separation of concerns
 */

import { Amendment, EntityType } from '@shared/amendment-types'
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
interface EntityData {
  allTasks: Array<{ id: string; name: string }>
  allWorkflows: Array<{ id: string; name: string; steps?: Array<{ id: string; name: string }> }>
}

/**
 * Find a task, workflow, or step by name using fuzzy matching
 *
 * @param name - The name to search for
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

  // Normalize for comparison
  const normalizedName = name.toLowerCase().trim()

  // SPECIAL HANDLING: When looking for a "step", search workflow steps first
  if (type === EntityType.Step) {
    for (const workflow of allWorkflows) {
      if (workflow.steps) {
        const step = workflow.steps.find(s =>
          s.name.toLowerCase().trim() === normalizedName ||
          s.name.toLowerCase().includes(normalizedName) ||
          normalizedName.includes(s.name.toLowerCase()),
        )
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
    const task = allTasks.find(t =>
      t.name.toLowerCase().trim() === normalizedName ||
      t.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(t.name.toLowerCase()),
    )
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
    const task = allTasks.find(t =>
      t.name.toLowerCase().trim() === normalizedName ||
      t.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(t.name.toLowerCase()),
    )
    if (task) return { id: task.id, type: EntityType.Task }
  } else if (type === EntityType.Workflow) {
    const workflow = allWorkflows.find(w =>
      w.name.toLowerCase().trim() === normalizedName ||
      w.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(w.name.toLowerCase()),
    )
    if (workflow) return { id: workflow.id, type: EntityType.Workflow }
  } else {
    // Search both types - workflows first (more specific)
    const workflow = allWorkflows.find(w =>
      w.name.toLowerCase().trim() === normalizedName ||
      w.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(w.name.toLowerCase()),
    )
    if (workflow) return { id: workflow.id, type: EntityType.Workflow }

    const task = allTasks.find(t =>
      t.name.toLowerCase().trim() === normalizedName ||
      t.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(t.name.toLowerCase()),
    )
    if (task) return { id: task.id, type: EntityType.Task }
  }

  return null
}

/**
 * Resolve target names to IDs by looking up tasks and workflows in the database.
 * This is critical because the AI generates amendments with names but no IDs.
 *
 * Mutates the amendments array in place by setting target.id and workflowTarget.id
 *
 * @param amendments - Array of amendments to resolve targets for
 * @param db - Database instance (optional, will use getDatabase() if not provided)
 */
export async function resolveAmendmentTargets(
  amendments: Amendment[],
  db?: ReturnType<typeof getDatabase>,
): Promise<void> {
  const database = db || getDatabase()

  // Load all tasks and workflows once
  const allTasks = await database.getTasks()
  const allWorkflows = await database.getSequencedTasks()

  const entityData: EntityData = { allTasks, allWorkflows }

  // Process each amendment and resolve targets
  for (const amendment of amendments) {
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
      } else {
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
      } else {
        logger.ui.warn('Could not resolve workflow target', {
          name: amendment.workflowTarget.name,
          availableWorkflows: allWorkflows.map(w => w.name).slice(0, 5),
        }, 'workflow-target-not-found')
      }
    }
  }
}
