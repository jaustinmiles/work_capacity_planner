/**
 * Reference Validator
 *
 * Validates that entity ID references in AI tool inputs (task type IDs,
 * task IDs, endeavor IDs, workflow step IDs) actually exist in the
 * database before the tool runs. This catches a common AI hallucination
 * where the agent invents IDs like `'deep-work'` instead of calling the
 * appropriate read tool first.
 *
 * Strategy:
 * - Each write tool registers an extractor in TOOL_VALIDATORS that walks
 *   its input and emits Reference objects.
 * - validateToolReferences groups references by entity type, lazily
 *   fetches the valid ID set for each type via the existing tRPC caller,
 *   and returns an error string naming the offending field path(s) if
 *   any reference is unknown.
 * - The agent loop forwards the error to Claude as a tool_result with
 *   is_error: true, so the agent can self-correct on its next turn.
 */

import type { appRouter } from '../router'
import { BlockConfigKind } from '../../shared/enums'

type RouterCaller = ReturnType<typeof appRouter.createCaller>

export enum EntityType {
  TaskType = 'TaskType',
  Task = 'Task',
  Endeavor = 'Endeavor',
  WorkflowStep = 'WorkflowStep',
}

export interface Reference {
  entityType: EntityType
  id: string
  /** Human-readable path used only in the error message, e.g. `steps[2].type`. */
  fieldPath: string
  /** For WorkflowStep references, the task this step must live in. */
  parentTaskId?: string
}

export type ReferenceExtractor = (input: Record<string, unknown>) => Reference[]

export type ValidationResult = { valid: true } | { valid: false; error: string }

/** Read tool the agent should call to discover valid IDs for each entity type. */
const READ_TOOL_FOR_ENTITY: Record<EntityType, string> = {
  [EntityType.TaskType]: 'get_task_types',
  [EntityType.Task]: 'get_tasks',
  [EntityType.Endeavor]: 'get_endeavors',
  [EntityType.WorkflowStep]: 'get_task_detail',
}

// ============================================================================
// Input shape helpers (the AI sends Record<string, unknown>, so narrow safely)
// ============================================================================

function getString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getObjectArray(input: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = input[key]
  if (!Array.isArray(value)) return []
  const out: Record<string, unknown>[] = []
  for (const item of value) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      out.push(item as Record<string, unknown>)
    }
  }
  return out
}

function getObject(input: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = input[key]
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

// ============================================================================
// Per-tool extractors
// ============================================================================

const extractCreateTask: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const type = getString(input, 'type')
  if (type !== undefined) {
    refs.push({ entityType: EntityType.TaskType, id: type, fieldPath: 'type' })
  }
  return refs
}

const extractUpdateTask: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const id = getString(input, 'id')
  if (id !== undefined) {
    refs.push({ entityType: EntityType.Task, id, fieldPath: 'id' })
  }
  const type = getString(input, 'type')
  if (type !== undefined) {
    refs.push({ entityType: EntityType.TaskType, id: type, fieldPath: 'type' })
  }
  return refs
}

const extractTaskIdOnly =
  (field: string): ReferenceExtractor =>
  input => {
    const id = getString(input, field)
    return id === undefined ? [] : [{ entityType: EntityType.Task, id, fieldPath: field }]
  }

const extractCreateWorkflow: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const type = getString(input, 'type')
  if (type !== undefined) {
    refs.push({ entityType: EntityType.TaskType, id: type, fieldPath: 'type' })
  }
  const steps = getObjectArray(input, 'steps')
  steps.forEach((step, i) => {
    const stepType = getString(step, 'type')
    if (stepType !== undefined) {
      refs.push({ entityType: EntityType.TaskType, id: stepType, fieldPath: `steps[${i}].type` })
    }
  })
  return refs
}

const extractAddWorkflowStep: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const workflowId = getString(input, 'workflowId')
  if (workflowId !== undefined) {
    refs.push({ entityType: EntityType.Task, id: workflowId, fieldPath: 'workflowId' })
  }
  const type = getString(input, 'type')
  if (type !== undefined) {
    refs.push({ entityType: EntityType.TaskType, id: type, fieldPath: 'type' })
  }
  return refs
}

const extractUpdateWorkflowStep: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const taskId = getString(input, 'taskId')
  if (taskId !== undefined) {
    refs.push({ entityType: EntityType.Task, id: taskId, fieldPath: 'taskId' })
  }
  const stepId = getString(input, 'stepId')
  if (stepId !== undefined) {
    refs.push({
      entityType: EntityType.WorkflowStep,
      id: stepId,
      fieldPath: 'stepId',
      parentTaskId: taskId,
    })
  }
  const type = getString(input, 'type')
  if (type !== undefined) {
    refs.push({ entityType: EntityType.TaskType, id: type, fieldPath: 'type' })
  }
  return refs
}

const extractRemoveWorkflowStep: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const taskId = getString(input, 'taskId')
  if (taskId !== undefined) {
    refs.push({ entityType: EntityType.Task, id: taskId, fieldPath: 'taskId' })
  }
  const stepId = getString(input, 'stepId')
  if (stepId !== undefined) {
    refs.push({
      entityType: EntityType.WorkflowStep,
      id: stepId,
      fieldPath: 'stepId',
      parentTaskId: taskId,
    })
  }
  return refs
}

const extractLogWorkSession: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const taskId = getString(input, 'taskId')
  if (taskId !== undefined) {
    refs.push({ entityType: EntityType.Task, id: taskId, fieldPath: 'taskId' })
  }
  const stepId = getString(input, 'stepId')
  if (stepId !== undefined) {
    refs.push({
      entityType: EntityType.WorkflowStep,
      id: stepId,
      fieldPath: 'stepId',
      parentTaskId: taskId,
    })
  }
  return refs
}

const extractLinkTaskToEndeavor: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const endeavorId = getString(input, 'endeavorId')
  if (endeavorId !== undefined) {
    refs.push({ entityType: EntityType.Endeavor, id: endeavorId, fieldPath: 'endeavorId' })
  }
  const taskId = getString(input, 'taskId')
  if (taskId !== undefined) {
    refs.push({ entityType: EntityType.Task, id: taskId, fieldPath: 'taskId' })
  }
  return refs
}

const extractCreateTimer: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const linkedTaskId = getString(input, 'linkedTaskId')
  if (linkedTaskId !== undefined) {
    refs.push({ entityType: EntityType.Task, id: linkedTaskId, fieldPath: 'linkedTaskId' })
  }
  const linkedStepId = getString(input, 'linkedStepId')
  if (linkedStepId !== undefined) {
    refs.push({
      entityType: EntityType.WorkflowStep,
      id: linkedStepId,
      fieldPath: 'linkedStepId',
      parentTaskId: linkedTaskId,
    })
  }
  return refs
}

const extractCreateSchedule: ReferenceExtractor = input => {
  const refs: Reference[] = []
  const blocks = getObjectArray(input, 'blocks')
  blocks.forEach((block, i) => {
    const typeConfig = getObject(block, 'typeConfig')
    if (typeConfig === undefined) return
    const kind = getString(typeConfig, 'kind')
    if (kind === BlockConfigKind.Single) {
      const typeId = getString(typeConfig, 'typeId')
      if (typeId !== undefined) {
        refs.push({
          entityType: EntityType.TaskType,
          id: typeId,
          fieldPath: `blocks[${i}].typeConfig.typeId`,
        })
      }
    } else if (kind === BlockConfigKind.Combo) {
      const allocations = getObjectArray(typeConfig, 'allocations')
      allocations.forEach((alloc, j) => {
        const typeId = getString(alloc, 'typeId')
        if (typeId !== undefined) {
          refs.push({
            entityType: EntityType.TaskType,
            id: typeId,
            fieldPath: `blocks[${i}].typeConfig.allocations[${j}].typeId`,
          })
        }
      })
    }
    // Any / System: nothing to validate
  })
  return refs
}

/**
 * Registry of per-tool reference extractors. Write tools missing from
 * this map have no references to validate (e.g., create_task_type,
 * pause_timer) and pass through unchecked.
 */
export const TOOL_VALIDATORS: Record<string, ReferenceExtractor> = {
  create_task: extractCreateTask,
  update_task: extractUpdateTask,
  complete_task: extractTaskIdOnly('id'),
  archive_task: extractTaskIdOnly('id'),
  create_workflow: extractCreateWorkflow,
  add_workflow_step: extractAddWorkflowStep,
  update_workflow_step: extractUpdateWorkflowStep,
  remove_workflow_step: extractRemoveWorkflowStep,
  log_work_session: extractLogWorkSession,
  link_task_to_endeavor: extractLinkTaskToEndeavor,
  manage_sprint: extractTaskIdOnly('taskId'),
  create_timer: extractCreateTimer,
  create_schedule: extractCreateSchedule,
}

// ============================================================================
// Dispatcher
// ============================================================================

interface LookupSets {
  taskType?: Set<string>
  task?: Set<string>
  endeavor?: Set<string>
  /** WorkflowStep IDs scoped per parent task (parentTaskId → Set of step IDs). */
  stepsByTask: Map<string, Set<string>>
}

async function loadIdSet(
  caller: RouterCaller,
  entityType: EntityType.TaskType | EntityType.Task | EntityType.Endeavor,
): Promise<Set<string>> {
  if (entityType === EntityType.TaskType) {
    const types = await caller.userTaskType.getAll()
    return new Set(types.map(t => t.id))
  }
  if (entityType === EntityType.Task) {
    const tasks = await caller.task.getAll({ includeArchived: true })
    return new Set(tasks.map(t => t.id))
  }
  // Endeavor
  const endeavors = await caller.endeavor.getAll({ includeArchived: true })
  return new Set(endeavors.map(e => e.id))
}

async function loadStepIdsForTask(caller: RouterCaller, taskId: string): Promise<Set<string>> {
  try {
    const task = await caller.task.getById({ id: taskId })
    const steps = Array.isArray(task?.steps) ? task.steps : []
    const ids = new Set<string>()
    for (const step of steps) {
      if (step !== null && typeof step === 'object' && 'id' in step) {
        const id = (step as { id: unknown }).id
        if (typeof id === 'string') ids.add(id)
      }
    }
    return ids
  } catch {
    // Task lookup failure means we can't validate steps — return empty,
    // and the Task-level check on the same input will already flag the
    // bad parentTaskId, so the user gets a clear error.
    return new Set()
  }
}

/**
 * Validate every entity-ID reference declared by the tool's extractor.
 * Returns `{ valid: true }` if all references resolve, or `{ valid: false, error }`
 * with one line per invalid reference.
 */
export async function validateToolReferences(
  toolName: string,
  input: Record<string, unknown>,
  caller: RouterCaller,
): Promise<ValidationResult> {
  const extractor = TOOL_VALIDATORS[toolName]
  if (extractor === undefined) {
    return { valid: true }
  }

  const refs = extractor(input)
  if (refs.length === 0) {
    return { valid: true }
  }

  // Validate top-level entities first (TaskType, Task, Endeavor) so that
  // WorkflowStep validation can skip when its parent task is unknown.
  const lookups: LookupSets = { stepsByTask: new Map() }
  const errors: string[] = []

  const needsTaskType = refs.some(r => r.entityType === EntityType.TaskType)
  const needsTask = refs.some(r => r.entityType === EntityType.Task)
  const needsEndeavor = refs.some(r => r.entityType === EntityType.Endeavor)

  if (needsTaskType) lookups.taskType = await loadIdSet(caller, EntityType.TaskType)
  if (needsTask) lookups.task = await loadIdSet(caller, EntityType.Task)
  if (needsEndeavor) lookups.endeavor = await loadIdSet(caller, EntityType.Endeavor)

  const invalidParentTasks = new Set<string>()

  for (const ref of refs) {
    if (ref.entityType === EntityType.TaskType) {
      if (lookups.taskType && !lookups.taskType.has(ref.id)) {
        errors.push(formatError(ref))
      }
    } else if (ref.entityType === EntityType.Task) {
      if (lookups.task && !lookups.task.has(ref.id)) {
        errors.push(formatError(ref))
        invalidParentTasks.add(ref.id)
      }
    } else if (ref.entityType === EntityType.Endeavor) {
      if (lookups.endeavor && !lookups.endeavor.has(ref.id)) {
        errors.push(formatError(ref))
      }
    }
  }

  for (const ref of refs) {
    if (ref.entityType !== EntityType.WorkflowStep) continue
    if (ref.parentTaskId === undefined) {
      errors.push(
        `Invalid WorkflowStep reference at ${ref.fieldPath}: '${ref.id}'. Step references require a parent task ID in the same input.`,
      )
      continue
    }
    if (invalidParentTasks.has(ref.parentTaskId)) {
      // Parent task is already flagged — don't pile on with a confusing step error.
      continue
    }
    let stepIds = lookups.stepsByTask.get(ref.parentTaskId)
    if (stepIds === undefined) {
      stepIds = await loadStepIdsForTask(caller, ref.parentTaskId)
      lookups.stepsByTask.set(ref.parentTaskId, stepIds)
    }
    if (!stepIds.has(ref.id)) {
      errors.push(formatError(ref))
    }
  }

  if (errors.length === 0) return { valid: true }
  return { valid: false, error: errors.join('\n') }
}

function formatError(ref: Reference): string {
  const readTool = READ_TOOL_FOR_ENTITY[ref.entityType]
  return `Invalid ${ref.entityType} reference at ${ref.fieldPath}: '${ref.id}'. No ${ref.entityType} with this ID exists. Call ${readTool} to see valid IDs before retrying.`
}
