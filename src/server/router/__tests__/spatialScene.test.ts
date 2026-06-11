/**
 * Tests for the spatial scene router and its shared morph engine.
 *
 * Covers:
 *   - applyTaskStructureMorph: connecting two standalone tasks materializes a
 *     workflow with two sequenced steps, archives the originals, and recalculates
 *     metrics (the engine the visionOS scene shares with the Deep Work Board).
 *   - resolveEntityIdentity: the projection swap (taskNode ↔ stepNode) applied to
 *     SpatialEntity rows after a morph.
 *   - Zod input validation for entity creation / transform / connect.
 *   - Router CRUD wiring via createCaller (ensureScene, getScene, createEntity,
 *     setRendered) including enum narrowing through parseEnum.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { createMockContext, type MockPrisma } from './router-test-helpers'
import { appRouter } from '../index'
import {
  resolveEntityIdentity,
  resolveBlockingStep,
  resolveBlockedEndpoint,
  ensureClusterEndeavor,
  createEntityInput,
  updateEntityTransformInput,
  connectInput,
} from '../spatialScene'
import { applyTaskStructureMorph } from '../../morph-executor'
import { buildConnectMorphResult } from '../../../shared/deep-work-morph'
import { formatTaskFromPrisma, type PrismaTaskResult } from '../../../shared/deep-work-formatters'
import type { DeepWorkNodeWithData } from '../../../shared/deep-work-board-types'
import type { SpatialEntity } from '../../../shared/spatial-types'
import { SpatialEntityKind } from '../../../shared/enums'

// =============================================================================
// Fixtures
// =============================================================================

function prismaTask(overrides: Partial<PrismaTaskResult> = {}): PrismaTaskResult {
  return {
    id: 'task-a',
    name: 'Task A',
    duration: 30,
    importance: 5,
    urgency: 5,
    type: 'type-dev',
    category: 'work',
    asyncWaitTime: 0,
    dependencies: '[]',
    completed: false,
    completedAt: null,
    actualDuration: null,
    notes: null,
    projectId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    sessionId: 'test-session-id',
    deadline: null,
    deadlineType: null,
    cognitiveComplexity: null,
    isLocked: false,
    lockedStartTime: null,
    hasSteps: false,
    currentStepId: null,
    overallStatus: 'not_started',
    criticalPathDuration: 30,
    worstCaseDuration: 30,
    archived: false,
    inActiveSprint: false,
    TaskStep: [],
    ...overrides,
  }
}

/** Build a standalone-task node entity (id = SpatialEntity id) for the morph planner. */
function makeTaskNode(entityId: string, task: PrismaTaskResult): DeepWorkNodeWithData {
  return {
    id: entityId,
    boardId: '',
    taskId: task.id,
    stepId: null,
    positionX: 0,
    positionY: 0,
    width: 0,
    height: 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    task: formatTaskFromPrisma(task),
    step: null,
    parentTask: null,
  }
}

function spatialEntity(overrides: Partial<SpatialEntity> = {}): SpatialEntity {
  return {
    id: 'ent-1',
    sceneId: 'scene-1',
    kind: SpatialEntityKind.TaskNode,
    refId: 'task-1',
    noteText: null,
    parentId: null,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    rotationW: 1,
    scale: 1,
    isRendered: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

/** Minimal prisma mock for the link-resolution helpers. */
function makeResolvePrisma() {
  return {
    task: { findUnique: vi.fn() },
    taskStep: { findUnique: vi.fn() },
  }
}

/** A hand-controlled transaction-client mock whose calls we can assert on. */
function makeTxMock() {
  return {
    task: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    taskStep: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    workSession: { updateMany: vi.fn() },
    spatialEntity: { update: vi.fn() },
  }
}

// =============================================================================
// Engine: applyTaskStructureMorph
// =============================================================================

describe('applyTaskStructureMorph (CreateWorkflow)', () => {
  it('materializes a workflow with two sequenced steps and archives the originals', async () => {
    const source = makeTaskNode('ent-src', prismaTask({ id: 'task-a', name: 'Design', duration: 20 }))
    const target = makeTaskNode('ent-tgt', prismaTask({ id: 'task-b', name: 'Build', duration: 40 }))

    const morph = buildConnectMorphResult(source, target, [])

    const tx = makeTxMock()
    // Metrics recalculation reads the freshly-created steps back.
    tx.taskStep.findMany.mockResolvedValue(
      morph.stepCreations.map((s) => ({
        id: s.id,
        duration: s.duration,
        dependsOn: JSON.stringify(s.dependsOn),
      })),
    )

    await applyTaskStructureMorph(tx as unknown as Prisma.TransactionClient, morph)

    // One workflow task created, flagged as a container.
    expect(tx.task.create).toHaveBeenCalledTimes(1)
    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({ hasSteps: true })

    // Two steps created; the second depends on the first (linear chain).
    expect(tx.taskStep.create).toHaveBeenCalledTimes(2)
    const firstStepId = morph.stepCreations[0].id
    expect(morph.stepCreations[1].dependsOn).toContain(firstStepId)

    // Both original standalone tasks archived.
    const archivedIds = tx.task.update.mock.calls
      .filter((call) => call[0].data?.archived === true)
      .map((call) => call[0].where.id)
    expect(archivedIds).toEqual(expect.arrayContaining(['task-a', 'task-b']))

    // Work sessions reassigned for each morphed task.
    expect(tx.workSession.updateMany).toHaveBeenCalledTimes(2)

    // Workflow metrics recalculated (duration = sum of step durations).
    const metricsUpdate = tx.task.update.mock.calls.find(
      (call) => typeof call[0].data?.criticalPathDuration === 'number',
    )
    expect(metricsUpdate).toBeDefined()
    expect(metricsUpdate?.[0].data.duration).toBe(60)
  })
})

// =============================================================================
// Projection swap: resolveEntityIdentity
// =============================================================================

describe('resolveEntityIdentity', () => {
  it('maps a node that gained a stepId to a step node', () => {
    expect(resolveEntityIdentity(null, 'step-1')).toEqual({
      kind: SpatialEntityKind.StepNode,
      refId: 'step-1',
    })
  })

  it('maps a node that reverted to a taskId back to a task node', () => {
    expect(resolveEntityIdentity('task-1', null)).toEqual({
      kind: SpatialEntityKind.TaskNode,
      refId: 'task-1',
    })
  })

  it('prefers the step identity when both are somehow present', () => {
    expect(resolveEntityIdentity('task-1', 'step-1').kind).toBe(SpatialEntityKind.StepNode)
  })
})

// =============================================================================
// Link resolution (link without combining)
// =============================================================================

describe('resolveBlockingStep', () => {
  it('uses the step itself when the source is a step node', async () => {
    const prisma = makeResolvePrisma()
    prisma.taskStep.findUnique.mockResolvedValue({ id: 'step-9', taskId: 'wf-1' })

    const result = await resolveBlockingStep(
      prisma as unknown as Parameters<typeof resolveBlockingStep>[0],
      spatialEntity({ kind: SpatialEntityKind.StepNode, refId: 'step-9' }),
    )
    expect(result).toEqual({ blockingStepId: 'step-9', blockingTaskId: 'wf-1' })
  })

  it('uses a workflow task node\'s last step as the blocker', async () => {
    const prisma = makeResolvePrisma()
    prisma.task.findUnique.mockResolvedValue({
      id: 'wf-2',
      hasSteps: true,
      TaskStep: [{ id: 'last-step', taskId: 'wf-2' }],
    })

    const result = await resolveBlockingStep(
      prisma as unknown as Parameters<typeof resolveBlockingStep>[0],
      spatialEntity({ kind: SpatialEntityKind.TaskNode, refId: 'wf-2' }),
    )
    expect(result).toEqual({ blockingStepId: 'last-step', blockingTaskId: 'wf-2' })
  })

  it('rejects a standalone task as a blocker (no step to block with)', async () => {
    const prisma = makeResolvePrisma()
    prisma.task.findUnique.mockResolvedValue({ id: 't', hasSteps: false, TaskStep: [] })

    await expect(
      resolveBlockingStep(
        prisma as unknown as Parameters<typeof resolveBlockingStep>[0],
        spatialEntity({ kind: SpatialEntityKind.TaskNode, refId: 't' }),
      ),
    ).rejects.toThrow()
  })
})

describe('resolveBlockedEndpoint', () => {
  it('blocks a step when the target is a step node', async () => {
    const prisma = makeResolvePrisma()
    prisma.taskStep.findUnique.mockResolvedValue({ id: 's', taskId: 'parent' })

    const result = await resolveBlockedEndpoint(
      prisma as unknown as Parameters<typeof resolveBlockedEndpoint>[0],
      spatialEntity({ kind: SpatialEntityKind.StepNode, refId: 's' }),
    )
    expect(result).toEqual({ blockedStepId: 's', parentTaskId: 'parent' })
  })

  it('blocks a task when the target is a task node', async () => {
    const prisma = makeResolvePrisma()
    const result = await resolveBlockedEndpoint(
      prisma as unknown as Parameters<typeof resolveBlockedEndpoint>[0],
      spatialEntity({ kind: SpatialEntityKind.TaskNode, refId: 'task-7' }),
    )
    expect(result).toEqual({ blockedTaskId: 'task-7', parentTaskId: 'task-7' })
  })
})

// =============================================================================
// Cluster endeavors (workflow↔workflow links, union-find)
// =============================================================================

describe('ensureClusterEndeavor', () => {
  function makeClusterPrisma() {
    const prisma = {
      endeavor: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
      task: { findUnique: vi.fn() },
      endeavorItem: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
      endeavorDependency: { updateMany: vi.fn() },
      // mergeEndeavors wraps its writes in a transaction; run the callback against the same mock.
      $transaction: vi.fn(),
    }
    prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma))
    return prisma
  }
  type ClusterPrisma = ReturnType<typeof makeClusterPrisma>
  const call = (p: ClusterPrisma, s: string, t: string) =>
    ensureClusterEndeavor(p as unknown as Parameters<typeof ensureClusterEndeavor>[0], 'sess-1', s, t)

  it('auto-creates a "Source → Target"-named cluster when neither workflow is clustered', async () => {
    const prisma = makeClusterPrisma()
    prisma.endeavor.findFirst.mockResolvedValue(null) // neither in a cluster
    prisma.endeavor.count.mockResolvedValue(0)
    prisma.task.findUnique
      .mockResolvedValueOnce({ name: 'Design' })
      .mockResolvedValueOnce({ name: 'Build' })
    prisma.endeavor.create.mockImplementation(({ data }: { data: { id: string } }) => ({ id: data.id }))

    await call(prisma, 'wf-a', 'wf-b')

    expect(prisma.endeavor.create).toHaveBeenCalledTimes(1)
    const data = prisma.endeavor.create.mock.calls[0][0].data
    expect(data.name).toBe('Design → Build')
    expect(data.id.startsWith('spatiallink')).toBe(true) // stable cluster marker
    expect(data.color).toMatch(/^#[0-9A-F]{6}$/i)        // auto-assigned palette color
  })

  it('reuses the existing cluster when one workflow already belongs to one', async () => {
    const prisma = makeClusterPrisma()
    prisma.endeavor.findFirst
      .mockResolvedValueOnce({ id: 'spatiallink_c1' }) // source already clustered
      .mockResolvedValueOnce(null) // target not clustered

    const result = await call(prisma, 'wf-a', 'wf-c')

    expect(result.id).toBe('spatiallink_c1')
    expect(prisma.endeavor.create).not.toHaveBeenCalled()
  })

  it('merges two separate clusters (B→C joins A→B into one endeavor)', async () => {
    const prisma = makeClusterPrisma()
    prisma.endeavor.findFirst
      .mockResolvedValueOnce({ id: 'spatiallink_c1' }) // source cluster
      .mockResolvedValueOnce({ id: 'spatiallink_c2' }) // target cluster (different)
    prisma.endeavorItem.findMany.mockResolvedValue([{ id: 'item-x', taskId: 'wf-x' }])
    prisma.endeavorItem.findUnique.mockResolvedValue(null) // no dup item in c1

    const result = await call(prisma, 'wf-a', 'wf-d')

    // The two clusters collapse into one (c1); c2's items + deps move over and c2 is deleted.
    expect(result.id).toBe('spatiallink_c1')
    expect(prisma.endeavorItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { endeavorId: 'spatiallink_c1' } }),
    )
    expect(prisma.endeavorDependency.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endeavorId: 'spatiallink_c2' }, data: { endeavorId: 'spatiallink_c1' } }),
    )
    expect(prisma.endeavor.delete).toHaveBeenCalledWith({ where: { id: 'spatiallink_c2' } })
    expect(prisma.endeavor.create).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Input validation
// =============================================================================

describe('spatialScene input schemas', () => {
  it('accepts a valid note-creation input', () => {
    const result = createEntityInput.safeParse({
      sceneId: 'scene-1',
      kind: SpatialEntityKind.Note,
      noteText: 'remember this',
      positionX: 1,
      positionY: 2,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown entity kind', () => {
    const result = createEntityInput.safeParse({
      sceneId: 'scene-1',
      kind: 'hologram',
      positionX: 0,
      positionY: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-positive scale', () => {
    const result = createEntityInput.safeParse({
      sceneId: 'scene-1',
      kind: SpatialEntityKind.TaskNode,
      positionX: 0,
      positionY: 0,
      scale: 0,
    })
    expect(result.success).toBe(false)
  })

  it('requires all three position axes on a transform update', () => {
    const result = updateEntityTransformInput.safeParse({
      id: 'ent-1',
      positionX: 1,
      positionY: 2,
      // positionZ missing
    })
    expect(result.success).toBe(false)
  })

  it('requires both endpoints to connect', () => {
    expect(connectInput.safeParse({ sceneId: 's', sourceEntityId: 'a' }).success).toBe(false)
    expect(
      connectInput.safeParse({ sceneId: 's', sourceEntityId: 'a', targetEntityId: 'b' }).success,
    ).toBe(true)
  })
})

// =============================================================================
// Router CRUD via createCaller
// =============================================================================

describe('spatialScene router', () => {
  let ctx: ReturnType<typeof createMockContext>
  let mockPrisma: MockPrisma

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
    // Session middleware (hasSession) verifies the session exists.
    mockPrisma.session.findUnique.mockResolvedValue({ id: 'test-session-id', name: 'Test' })
  })

  it('ensureScene creates a scene for the session when none exists', async () => {
    mockPrisma.spatialScene.findFirst.mockResolvedValue(null)
    mockPrisma.spatialScene.create.mockImplementation(({ data }: { data: { id: string } }) => ({
      id: data.id,
      sessionId: 'test-session-id',
      name: 'Spatial Scene',
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    const caller = appRouter.createCaller(ctx)
    const result = await caller.spatialScene.ensureScene()

    expect(mockPrisma.spatialScene.create).toHaveBeenCalledTimes(1)
    expect(result.scene.sessionId).toBe('test-session-id')
    expect(result.entities).toEqual([])
  })

  it('ensureScene returns the existing scene with its entities', async () => {
    mockPrisma.spatialScene.findFirst.mockResolvedValue({
      id: 'scene-1',
      sessionId: 'test-session-id',
      name: 'Spatial Scene',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mockPrisma.spatialEntity.findMany.mockResolvedValue([
      {
        id: 'ent-1',
        sceneId: 'scene-1',
        kind: 'note',
        refId: null,
        noteText: 'hi',
        parentId: null,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        rotationW: 1,
        scale: 1,
        isRendered: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const caller = appRouter.createCaller(ctx)
    const result = await caller.spatialScene.ensureScene()

    expect(mockPrisma.spatialScene.create).not.toHaveBeenCalled()
    expect(result.scene.id).toBe('scene-1')
    expect(result.entities).toHaveLength(1)
    // kind narrowed from DB string to the enum.
    expect(result.entities[0].kind).toBe(SpatialEntityKind.Note)
  })

  it('getScene returns null when the session has no scene', async () => {
    mockPrisma.spatialScene.findFirst.mockResolvedValue(null)

    const caller = appRouter.createCaller(ctx)
    const result = await caller.spatialScene.getScene()

    expect(result).toBeNull()
  })

  it('createEntity persists a note and narrows the kind enum on return', async () => {
    mockPrisma.spatialEntity.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      noteText: data.noteText ?? null,
      refId: data.refId ?? null,
      parentId: data.parentId ?? null,
      positionZ: data.positionZ ?? 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      rotationW: 1,
      scale: data.scale ?? 1,
      isRendered: true,
    }))

    const caller = appRouter.createCaller(ctx)
    const entity = await caller.spatialScene.createEntity({
      sceneId: 'scene-1',
      kind: SpatialEntityKind.Note,
      noteText: 'spatial note',
      positionX: 1,
      positionY: 2,
      positionZ: 3,
    })

    expect(entity.kind).toBe(SpatialEntityKind.Note)
    expect(entity.noteText).toBe('spatial note')
    expect(entity.positionZ).toBe(3)
  })

  it('collapseWorkflow creates a volume and hides the workflow\'s step nodes', async () => {
    mockPrisma.taskStep.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }])
    const memberRows = [
      {
        id: 'ent-s1', sceneId: 'scene-1', kind: 'stepNode', refId: 's1', noteText: null, parentId: null,
        positionX: -0.2, positionY: 0, positionZ: 0, rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
        scale: 1, isRendered: true, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 'ent-s2', sceneId: 'scene-1', kind: 'stepNode', refId: 's2', noteText: null, parentId: null,
        positionX: 0.2, positionY: 0, positionZ: 0, rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
        scale: 1, isRendered: true, createdAt: new Date(), updatedAt: new Date(),
      },
    ]
    mockPrisma.spatialEntity.findMany.mockResolvedValue(memberRows)
    mockPrisma.spatialEntity.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data, noteText: null, refId: data.refId ?? null, parentId: null,
      positionZ: data.positionZ ?? 0, rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
      scale: 1, isRendered: true,
    }))
    mockPrisma.spatialEntity.update.mockResolvedValue({})
    mockPrisma.spatialScene.findFirstOrThrow.mockResolvedValue({
      id: 'scene-1', sessionId: 'test-session-id', name: 'Spatial Scene', createdAt: new Date(), updatedAt: new Date(),
    })

    const caller = appRouter.createCaller(ctx)
    const result = await caller.spatialScene.collapseWorkflow({ sceneId: 'scene-1', workflowTaskId: 'wf-1' })

    // A workflow volume was created for the workflow.
    const createArg = mockPrisma.spatialEntity.create.mock.calls[0][0].data
    expect(createArg.kind).toBe(SpatialEntityKind.WorkflowVolume)
    expect(createArg.refId).toBe('wf-1')
    // Both member step nodes were reparented + hidden.
    expect(mockPrisma.spatialEntity.update).toHaveBeenCalledTimes(2)
    expect(result.entities).toHaveLength(2)
  })

  it('re-collapsing a workflow reparents a newly joined loose step alongside collapsed ones', async () => {
    // Regression for the joined-step ownership bug: wf-1 already has a volume + two COLLAPSED steps
    // (parentId=vol-1). A third step (s3) was just joined via a port connection, so its SpatialEntity
    // is still LOOSE (parentId=null, isRendered=true) — the morph swaps the node to a stepNode but
    // does NOT parent it. The client re-runs collapseWorkflow (now triggered for any loose step), which
    // must reparent ALL members (including s3) so it's owned by the volume — otherwise collapse skips
    // it and dismiss orphans it (a floating duplicate). It must also REUSE the existing volume.
    mockPrisma.taskStep.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }])
    const row = (over: Record<string, unknown>) => ({
      id: 'x', sceneId: 'scene-1', kind: 'stepNode', refId: null, noteText: null, parentId: null,
      positionX: 0, positionY: 0, positionZ: 0, rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
      scale: 1, isRendered: true, createdAt: new Date(), updatedAt: new Date(), ...over,
    })
    mockPrisma.spatialEntity.findMany.mockResolvedValue([
      row({ id: 'vol-1', kind: 'workflowVolume', refId: 'wf-1' }),
      row({ id: 'ent-s1', refId: 's1', parentId: 'vol-1', isRendered: false }),
      row({ id: 'ent-s2', refId: 's2', parentId: 'vol-1', isRendered: false }),
      row({ id: 'ent-s3', refId: 's3', parentId: null, isRendered: true }), // freshly joined, loose
    ])
    mockPrisma.spatialEntity.update.mockResolvedValue({})
    mockPrisma.spatialScene.findFirstOrThrow.mockResolvedValue({
      id: 'scene-1', sessionId: 'test-session-id', name: 'Spatial Scene', createdAt: new Date(), updatedAt: new Date(),
    })

    const caller = appRouter.createCaller(ctx)
    await caller.spatialScene.collapseWorkflow({ sceneId: 'scene-1', workflowTaskId: 'wf-1' })

    // Reuses the existing volume — no duplicate volume created.
    expect(mockPrisma.spatialEntity.create).not.toHaveBeenCalled()
    // All THREE member step nodes reparented + hidden (incl. the freshly joined s3).
    expect(mockPrisma.spatialEntity.update).toHaveBeenCalledTimes(3)
    const joined = mockPrisma.spatialEntity.update.mock.calls.find((c) => c[0].where.id === 'ent-s3')
    expect(joined?.[0].data).toMatchObject({ parentId: 'vol-1', isRendered: false })
  })

  it('setRendered toggles an entity visibility flag', async () => {
    mockPrisma.spatialEntity.update.mockResolvedValue({
      id: 'ent-1',
      sceneId: 'scene-1',
      kind: 'taskNode',
      refId: 'task-1',
      noteText: null,
      parentId: null,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      rotationW: 1,
      scale: 1,
      isRendered: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const caller = appRouter.createCaller(ctx)
    const entity = await caller.spatialScene.setRendered({ id: 'ent-1', isRendered: false })

    expect(mockPrisma.spatialEntity.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ent-1' } }),
    )
    expect(entity.isRendered).toBe(false)
    expect(entity.kind).toBe(SpatialEntityKind.TaskNode)
  })

  // Trust-boundary regression: createTaskEntity persisted any provided `type` string
  // unchecked, letting clients (incl. the AI agent) mint tasks with orphan types.
  describe('createTaskEntity task type validation', () => {
    const baseInput = {
      sceneId: 'scene-1',
      name: 'Spatial Task',
      positionX: 0.1,
      positionY: 0.2,
    }

    function wireHappyPathWrites(expectedType: string): void {
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: MockPrisma) => Promise<unknown>) => callback(mockPrisma),
      )
      mockPrisma.task.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...prismaTask({ id: 'task-new', type: expectedType }),
          ...data,
          TaskStep: [],
        }),
      )
      mockPrisma.spatialEntity.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          noteText: null,
          parentId: null,
          rotationX: 0,
          rotationY: 0,
          rotationZ: 0,
          rotationW: 1,
          scale: 1,
          isRendered: true,
          ...data,
        }),
      )
    }

    it('rejects an explicit unknown type with BAD_REQUEST and writes nothing', async () => {
      mockPrisma.userTaskType.findMany.mockResolvedValue([])

      const caller = appRouter.createCaller(ctx)
      await expect(
        caller.spatialScene.createTaskEntity({ ...baseInput, type: 'hallucinated-type' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(mockPrisma.userTaskType.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['hallucinated-type'] }, sessionId: 'test-session-id' },
        select: { id: true },
      })
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockPrisma.task.create).not.toHaveBeenCalled()
    })

    it('accepts an explicit type that exists in the session', async () => {
      mockPrisma.userTaskType.findMany.mockResolvedValue([{ id: 'type-dev' }])
      wireHappyPathWrites('type-dev')

      const caller = appRouter.createCaller(ctx)
      const result = await caller.spatialScene.createTaskEntity({ ...baseInput, type: 'type-dev' })

      expect(result.node.task?.type).toBe('type-dev')
      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'type-dev' }) }),
      )
    })

    it('still defaults an OMITTED type to the session\'s first task type without validation', async () => {
      mockPrisma.userTaskType.findFirst.mockResolvedValue({ id: 'type-first' })
      wireHappyPathWrites('type-first')

      const caller = appRouter.createCaller(ctx)
      const result = await caller.spatialScene.createTaskEntity(baseInput)

      expect(mockPrisma.userTaskType.findFirst).toHaveBeenCalledWith({
        where: { sessionId: 'test-session-id' },
        orderBy: { sortOrder: 'asc' },
      })
      // The default path never hits the validator's findMany lookup.
      expect(mockPrisma.userTaskType.findMany).not.toHaveBeenCalled()
      expect(result.node.task?.type).toBe('type-first')
    })
  })
})
