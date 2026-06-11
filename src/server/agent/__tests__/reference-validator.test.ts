/**
 * Tests for the AI reference validator.
 *
 * Verifies that hallucinated entity IDs (made-up task types, fake task
 * IDs, etc.) in write-tool inputs are caught before the executor runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateToolReferences,
  TOOL_VALIDATORS,
  EntityType,
} from '../reference-validator'
import { BlockConfigKind } from '../../../shared/enums'

/**
 * Build a stub caller that exposes only the methods the validator uses.
 * The validator's type is `ReturnType<typeof appRouter.createCaller>`; we
 * cast our stub to that shape so callers can be substituted in tests.
 */
function buildCaller(opts: {
  typeIds?: string[]
  taskIds?: string[]
  endeavorIds?: string[]
  tasksById?: Record<string, { id: string; steps: { id: string }[] }>
}) {
  const typeIds = opts.typeIds ?? []
  const taskIds = opts.taskIds ?? []
  const endeavorIds = opts.endeavorIds ?? []
  const tasksById = opts.tasksById ?? {}

  const stub = {
    userTaskType: {
      getAll: vi.fn(async () => typeIds.map(id => ({ id }))),
    },
    task: {
      getAll: vi.fn(async (_input: unknown) => taskIds.map(id => ({ id }))),
      getById: vi.fn(async (input: { id: string }) => tasksById[input.id] ?? null),
    },
    endeavor: {
      getAll: vi.fn(async (_input: unknown) => endeavorIds.map(id => ({ id }))),
    },
  }
  // Tests substitute this for the real RouterCaller — the validator only
  // touches the four methods above.
  return stub as unknown as Parameters<typeof validateToolReferences>[2]
}

describe('reference-validator extractors', () => {
  it('emits a TaskType reference for create_task', () => {
    const refs = TOOL_VALIDATORS.create_task({
      name: 'Test',
      duration: 30,
      importance: 5,
      urgency: 5,
      type: 'type-abc',
    })
    expect(refs).toEqual([
      { entityType: EntityType.TaskType, id: 'type-abc', fieldPath: 'type' },
    ])
  })

  it('emits a Task reference and conditional TaskType reference for update_task', () => {
    const refs = TOOL_VALIDATORS.update_task({
      id: 'task-1',
      type: 'type-x',
    })
    expect(refs).toContainEqual({ entityType: EntityType.Task, id: 'task-1', fieldPath: 'id' })
    expect(refs).toContainEqual({ entityType: EntityType.TaskType, id: 'type-x', fieldPath: 'type' })
  })

  it('omits the type reference for update_task when type is not provided', () => {
    const refs = TOOL_VALIDATORS.update_task({ id: 'task-1', name: 'rename' })
    expect(refs).toEqual([{ entityType: EntityType.Task, id: 'task-1', fieldPath: 'id' }])
  })

  it('emits a reference per step for create_workflow with indexed paths', () => {
    const refs = TOOL_VALIDATORS.create_workflow({
      name: 'wf',
      importance: 5,
      urgency: 5,
      type: 'type-root',
      steps: [
        { name: 'a', duration: 10, type: 'type-1' },
        { name: 'b', duration: 20, type: 'type-2' },
      ],
    })
    expect(refs).toEqual([
      { entityType: EntityType.TaskType, id: 'type-root', fieldPath: 'type' },
      { entityType: EntityType.TaskType, id: 'type-1', fieldPath: 'steps[0].type' },
      { entityType: EntityType.TaskType, id: 'type-2', fieldPath: 'steps[1].type' },
    ])
  })

  it('emits Task + WorkflowStep references for update_workflow_step, with parentTaskId set', () => {
    const refs = TOOL_VALIDATORS.update_workflow_step({
      taskId: 'task-1',
      stepId: 'step-1',
      type: 'type-x',
    })
    expect(refs).toContainEqual({ entityType: EntityType.Task, id: 'task-1', fieldPath: 'taskId' })
    expect(refs).toContainEqual({
      entityType: EntityType.WorkflowStep,
      id: 'step-1',
      fieldPath: 'stepId',
      parentTaskId: 'task-1',
    })
    expect(refs).toContainEqual({ entityType: EntityType.TaskType, id: 'type-x', fieldPath: 'type' })
  })

  it('emits Task + every WorkflowStep reference for reorder_workflow_steps', () => {
    const refs = TOOL_VALIDATORS.reorder_workflow_steps({
      taskId: 'task-1',
      orderedStepIds: ['step-b', 'step-a'],
    })
    expect(refs).toContainEqual({ entityType: EntityType.Task, id: 'task-1', fieldPath: 'taskId' })
    expect(refs).toContainEqual({
      entityType: EntityType.WorkflowStep,
      id: 'step-b',
      fieldPath: 'orderedStepIds[0]',
      parentTaskId: 'task-1',
    })
    expect(refs).toContainEqual({
      entityType: EntityType.WorkflowStep,
      id: 'step-a',
      fieldPath: 'orderedStepIds[1]',
      parentTaskId: 'task-1',
    })
  })

  it('walks blocks for create_schedule and emits typeId refs from Single + Combo configs', () => {
    const refs = TOOL_VALIDATORS.create_schedule({
      date: '2026-05-28',
      blocks: [
        { startTime: '09:00', endTime: '12:00', typeConfig: { kind: BlockConfigKind.Single, typeId: 'type-deep' } },
        {
          startTime: '13:00',
          endTime: '17:00',
          typeConfig: {
            kind: BlockConfigKind.Combo,
            allocations: [
              { typeId: 'type-mix-a', percentage: 60 },
              { typeId: 'type-mix-b', percentage: 40 },
            ],
          },
        },
        { startTime: '22:00', endTime: '23:00', typeConfig: { kind: BlockConfigKind.System, systemType: 'sleep' } },
        { startTime: '23:00', endTime: '24:00', typeConfig: { kind: BlockConfigKind.Any } },
      ],
    })
    expect(refs).toEqual([
      { entityType: EntityType.TaskType, id: 'type-deep', fieldPath: 'blocks[0].typeConfig.typeId' },
      { entityType: EntityType.TaskType, id: 'type-mix-a', fieldPath: 'blocks[1].typeConfig.allocations[0].typeId' },
      { entityType: EntityType.TaskType, id: 'type-mix-b', fieldPath: 'blocks[1].typeConfig.allocations[1].typeId' },
    ])
  })

  it('returns [] for write tools with no references (create_task_type, pause_timer)', () => {
    expect(TOOL_VALIDATORS.create_task_type).toBeUndefined()
    expect(TOOL_VALIDATORS.pause_timer).toBeUndefined()
  })

  it('does not crash on missing optional fields (create_workflow without steps)', () => {
    const refs = TOOL_VALIDATORS.create_workflow({
      name: 'wf',
      importance: 5,
      urgency: 5,
      type: 'type-root',
    })
    expect(refs).toEqual([
      { entityType: EntityType.TaskType, id: 'type-root', fieldPath: 'type' },
    ])
  })
})

describe('validateToolReferences dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns valid for tools not in the registry (e.g., create_task_type)', async () => {
    const caller = buildCaller({})
    const result = await validateToolReferences('create_task_type', { name: 'x', emoji: '🧠', color: '#fff' }, caller)
    expect(result).toEqual({ valid: true })
  })

  it('returns valid when the referenced TaskType exists', async () => {
    const caller = buildCaller({ typeIds: ['type-real'] })
    const result = await validateToolReferences(
      'create_task',
      { name: 't', duration: 10, importance: 5, urgency: 5, type: 'type-real' },
      caller,
    )
    expect(result).toEqual({ valid: true })
  })

  it('rejects a hallucinated TaskType with the right error and read-tool hint', async () => {
    const caller = buildCaller({ typeIds: ['type-real'] })
    const result = await validateToolReferences(
      'create_task',
      { name: 't', duration: 10, importance: 5, urgency: 5, type: 'deep-work' },
      caller,
    )
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain("Invalid TaskType reference at type: 'deep-work'")
    expect(result.error).toContain('get_task_types')
  })

  it('rejects a hallucinated Task ID with a get_tasks hint', async () => {
    const caller = buildCaller({ taskIds: ['task-real'] })
    const result = await validateToolReferences('archive_task', { id: 'task-fake' }, caller)
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain("Invalid Task reference at id: 'task-fake'")
    expect(result.error).toContain('get_tasks')
  })

  it('aggregates multiple validation errors in one response', async () => {
    const caller = buildCaller({ typeIds: ['type-real'], taskIds: ['task-real'] })
    const result = await validateToolReferences(
      'add_workflow_step',
      { workflowId: 'task-bogus', name: 's', duration: 10, type: 'type-bogus' },
      caller,
    )
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error.split('\n')).toHaveLength(2)
    expect(result.error).toContain("'task-bogus'")
    expect(result.error).toContain("'type-bogus'")
  })

  it('rejects a step that does not belong to the parent task', async () => {
    const caller = buildCaller({
      typeIds: ['type-real'],
      taskIds: ['task-1'],
      tasksById: { 'task-1': { id: 'task-1', steps: [{ id: 'step-A' }, { id: 'step-B' }] } },
    })
    const result = await validateToolReferences(
      'update_workflow_step',
      { taskId: 'task-1', stepId: 'step-Z', type: 'type-real' },
      caller,
    )
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain("Invalid WorkflowStep reference at stepId: 'step-Z'")
    expect(result.error).toContain('get_task_detail')
  })

  it('accepts a step that belongs to the parent task', async () => {
    const caller = buildCaller({
      typeIds: ['type-real'],
      taskIds: ['task-1'],
      tasksById: { 'task-1': { id: 'task-1', steps: [{ id: 'step-A' }] } },
    })
    const result = await validateToolReferences(
      'update_workflow_step',
      { taskId: 'task-1', stepId: 'step-A', type: 'type-real' },
      caller,
    )
    expect(result).toEqual({ valid: true })
  })

  it('skips the step check when the parent task is itself invalid (no piling-on)', async () => {
    const caller = buildCaller({ typeIds: ['type-real'], taskIds: [] })
    const result = await validateToolReferences(
      'update_workflow_step',
      { taskId: 'task-fake', stepId: 'step-anything', type: 'type-real' },
      caller,
    )
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain("'task-fake'")
    expect(result.error).not.toContain("'step-anything'")
  })

  it('rejects an unknown typeId inside a Combo schedule block', async () => {
    const caller = buildCaller({ typeIds: ['type-good'] })
    const result = await validateToolReferences(
      'create_schedule',
      {
        date: '2026-05-28',
        blocks: [
          {
            startTime: '09:00',
            endTime: '17:00',
            typeConfig: {
              kind: BlockConfigKind.Combo,
              allocations: [
                { typeId: 'type-good', percentage: 50 },
                { typeId: 'type-bogus', percentage: 50 },
              ],
            },
          },
        ],
      },
      caller,
    )
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain('blocks[0].typeConfig.allocations[1].typeId')
    expect(result.error).toContain("'type-bogus'")
  })

  it('only queries entity types it actually needs', async () => {
    const caller = buildCaller({ typeIds: ['type-real'] })
    await validateToolReferences(
      'create_task',
      { name: 't', duration: 10, importance: 5, urgency: 5, type: 'type-real' },
      caller,
    )
    expect(caller.userTaskType.getAll).toHaveBeenCalledTimes(1)
    expect(caller.task.getAll).not.toHaveBeenCalled()
    expect(caller.endeavor.getAll).not.toHaveBeenCalled()
  })
})
